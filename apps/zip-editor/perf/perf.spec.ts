import { expect, test, type Page } from '@playwright/test';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { downloadButton, editor, openFile, tree, uploadInput } from '../e2e/helpers/app.ts';
import { makeZip, type ZipEntries } from '../e2e/helpers/zip.ts';

/**
 * 성능 측정(ADR-0027). 결과는 perf-results/results.json에 모은다.
 * - 시간 지표는 기록하고, 목표를 넘으면 경고만 한다(러너 속도에 따라 달라지므로 실패시키지 않는다).
 * - 키 입력당 렌더는 기기와 상관없이 같은 값이 나오므로 목표를 넘으면 실패시킨다.
 */

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const results: Record<string, unknown> = {};

/** 시간 지표의 목표(ADR-0027). 넘으면 실패시키지 않고 경고한다. */
const TREE_TARGET_MS = 1000;
const LONG_TASK_TARGET = 0;
const warnings: string[] = [];

/** CI(GitHub Actions)에서는 경고 표시로, 로컬에서는 콘솔에 남긴다. */
function warn(message: string) {
  warnings.push(message);
  console.log(
    process.env.GITHUB_ACTIONS ? `::warning title=성능 목표 초과::${message}` : `경고: ${message}`,
  );
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const round = (value: number) => Math.round(value * 10) / 10;
const summary = (values: number[]) => ({
  runs: values.length,
  medianMs: round(median(values)),
  minMs: round(Math.min(...values)),
  maxMs: round(Math.max(...values)),
  samplesMs: values.map(round),
});

function manyFiles(count: number): ZipEntries {
  const entries: Record<string, string> = {};
  for (let i = 0; i < count; i += 1)
    entries[`pkg-${i % 100}/src/mod-${i}.ts`] = `export const v${i} = ${i};\n`;
  return entries;
}

/** 페이지에 측정 도구를 심는다. React DevTools 훅 자리에 커밋 수만 세는 가짜 훅을 둔다. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const perf = {
      commits: 0,
      longTasks: [] as number[],
      events: [] as number[],
      picked: 0,
      treeVisible: 0,
    };
    w.__perf = perf;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => {},
      onScheduleFiberRoot: () => {},
      onCommitFiberRoot: () => {
        perf.commits += 1;
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.events.push(entry.duration);
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    document.addEventListener(
      'change',
      (event) => {
        if ((event.target as HTMLInputElement | null)?.type === 'file')
          perf.picked = performance.now();
      },
      true,
    );
    new MutationObserver(() => {
      if (!perf.treeVisible && perf.picked && document.querySelector('[role="treeitem"]'))
        perf.treeVisible = performance.now();
    }).observe(document, { childList: true, subtree: true });
  });
}

type Perf = {
  commits: number;
  longTasks: number[];
  events: number[];
  picked: number;
  treeVisible: number;
};
const readPerf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __perf: Perf }).__perf);

async function upload(page: Page, entries: ZipEntries) {
  await expect(uploadInput(page)).toBeEnabled();
  await uploadInput(page).setInputFiles({
    name: 'project.zip',
    mimeType: 'application/zip',
    buffer: makeZip(entries),
  });
}

test.afterAll(async () => {
  results.environment = {
    measuredAt: new Date().toISOString(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
    ci: Boolean(process.env.CI),
  };
  results.warnings = warnings;
  await mkdir('perf-results', { recursive: true });
  await writeFile('perf-results/results.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  // CI 실행 요약에 표를 남겨, 산출물을 내려받지 않아도 추세를 볼 수 있게 한다.
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryTable());
});

function summaryTable(): string {
  const tree = results['tree-10000'] as { treeVisible: { medianMs: number } } | undefined;
  const typing = results.typing as Record<string, number> | undefined;
  const rows = [
    [
      '파일 1만 개 ZIP 트리 표시(중앙값)',
      `${tree?.treeVisible.medianMs ?? '-'}ms`,
      `${TREE_TARGET_MS}ms 이하`,
    ],
    [
      '입력 중 50ms를 넘는 긴 작업',
      `${typing?.longTasksOver50ms ?? '-'}건`,
      `${LONG_TASK_TARGET}건`,
    ],
    [
      '첫 입력 뒤 99글자 동안 React 커밋',
      `${typing?.next99KeystrokesCommits ?? '-'}회`,
      '0회(넘으면 실패)',
    ],
  ];
  const lines = ['## 성능 측정 (ADR-0027)', '', '| 지표 | 결과 | 목표 |', '|---|---|---|'];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  if (warnings.length > 0) lines.push('', ...warnings.map((message) => `- 경고: ${message}`));
  return `${lines.join('\n')}\n`;
}

for (const count of [10_000, 50_000]) {
  test(`파일 ${count}개 ZIP: 파일을 고른 뒤 트리 첫 줄이 보이기까지`, async ({ browser }) => {
    const entries = manyFiles(count);
    const visible: number[] = [];
    const measured: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await instrument(page);
      await page.goto('/');
      await upload(page, entries);
      await expect(tree(page).getByRole('treeitem').first()).toBeVisible();
      const perf = await readPerf(page);
      visible.push(perf.treeVisible - perf.picked);
      const ready = await page.evaluate(
        () => performance.getEntriesByName('codefold:tree-ready', 'measure')[0]?.duration ?? -1,
      );
      measured.push(ready);
      await context.close();
    }
    results[`tree-${count}`] = { treeVisible: summary(visible), appMeasure: summary(measured) };
    const medianMs = median(visible);
    if (count === 10_000 && medianMs > TREE_TARGET_MS)
      warn(
        `파일 1만 개 ZIP의 트리 표시가 ${round(medianMs)}ms로 목표 ${TREE_TARGET_MS}ms를 넘었습니다.`,
      );
  });
}

test('빠른 입력 100글자: React 커밋, 긴 작업, 입력 응답', async ({ page }) => {
  await instrument(page);
  await page.goto('/');
  const source = Array.from({ length: 300 }, (_, i) => `export const line${i} = ${i};`).join('\n');
  await upload(page, { 'main.ts': `${source}\n`, 'util.ts': 'export const util = 1;\n' });
  await openFile(page, 'main.ts');
  await editor(page).locator('.view-lines').click();
  await page.keyboard.press('ControlOrMeta+End');
  // 파일을 연 뒤 화면이 자리 잡을 때까지 기다린다(자동 저장 예약 등이 끝나게).
  await page.waitForTimeout(1500);
  const before = await readPerf(page);
  await page.keyboard.type('a');
  await page.waitForTimeout(300);
  const afterFirst = await readPerf(page);
  await page.keyboard.type('b'.repeat(99));
  const afterAll = await readPerf(page);
  const firstCommits = afterFirst.commits - before.commits;
  const restCommits = afterAll.commits - afterFirst.commits;
  const longTasks = afterAll.longTasks.slice(before.longTasks.length);
  const events = afterAll.events.slice(before.events.length);
  results.typing = {
    firstKeystrokeCommits: firstCommits,
    next99KeystrokesCommits: restCommits,
    longTasksOver50ms: longTasks.length,
    longTaskMaxMs: round(Math.max(0, ...longTasks)),
    slowEventsOver16ms: events.length,
    slowestEventMs: round(Math.max(0, ...events)),
  };
  if (longTasks.length > LONG_TASK_TARGET)
    warn(
      `입력 중 50ms를 넘는 긴 작업이 ${longTasks.length}건 있었습니다(가장 긴 것 ${round(Math.max(...longTasks))}ms).`,
    );
  // 첫 글자에서 파일이 수정됨으로 바뀌므로 커밋이 생겨야 한다. 0이면 가짜 훅이 불리지 않은 것이라
  // (React가 훅 모양을 바꾼 경우 등) 아래 검사가 헛돈다(ADR-0045).
  expect(
    firstCommits,
    '첫 입력에서 커밋이 없으면 개발자 도구 훅이 작동하지 않는 것이다',
  ).toBeGreaterThan(0);
  // 렌더 횟수는 기기와 상관없이 같으므로 목표를 넘으면 실패시킨다(ADR-0027).
  expect(restCommits, '첫 입력 뒤 99글자 동안 React 커밋은 0회여야 한다').toBe(0);
});

for (const count of [100, 10_000]) {
  test(`파일 ${count}개 ZIP: 한 파일을 수정하고 다운로드가 시작되기까지`, async ({ browser }) => {
    const entries = manyFiles(count);
    const samples: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      await page.goto('/');
      await upload(page, entries);
      await tree(page)
        .getByRole('treeitem', { name: /^pkg-0/ })
        .click();
      await tree(page).getByRole('treeitem', { name: /^src/ }).first().click();
      await openFile(page, 'mod-0.ts');
      await editor(page).locator('.view-lines').click();
      await page.keyboard.type('// 수정');
      await expect(downloadButton(page)).toBeEnabled();
      const started = Date.now();
      const download = page.waitForEvent('download');
      await downloadButton(page).click();
      await download;
      samples.push(Date.now() - started);
      await context.close();
    }
    results[`export-${count}`] = summary(samples);
  });
}
