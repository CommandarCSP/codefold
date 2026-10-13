import { expect, type Locator, type Page } from '@playwright/test';
import { makeZip, type ZipEntries } from './zip.ts';

/**
 * 화면 문구. src/utils/messages.ts, packages/react-code-editor/src/messages.ts와 같게 둔다. E2E는 Node 설정(nodenext)으로 컴파일되어
 * 확장자 없는 앱 소스 import를 따라가지 못하므로 따로 적는다.
 */
export const text = {
  upload: 'ZIP 올리기',
  download: '다운로드',
  emptyTitle: 'ZIP 파일을 올려 주세요',
  tree: '파일 트리',
  treeToggle: '파일 트리 열기',
  dropOverlay: '놓으면 이 ZIP을 엽니다',
  multiple: 'ZIP 파일 하나만 놓아 주세요.',
  notZip: 'ZIP 파일이 아니에요. 다른 파일을 골라 주세요.',
  restoreTitle: '이전 작업을 이어서 할까요?',
  resume: '이어 하기',
  discard: '버리기',
  lockBusy: '다른 탭에서 작업 중이에요',
  takeOver: '여기서 열기',
  lockGranted: '이제 이 탭에서 편집할 수 있어요',
  startEditing: '편집 시작',
  readOnly: '다른 탭으로 편집이 넘어갔어요',
  unsupported: '이 브라우저는 지원하지 않아요',
  unexported: (count: number) => `받지 않은 변경 ${count}개`,
  replaceTitle: '새 ZIP을 열까요?',
  replaceConfirm: '새 ZIP 열기',
  cancel: '취소',
  restoreFailedTitle: '이전 작업을 되살리지 못했어요',
  retry: '다시 시도',
  // 아래는 <CodeEditor> 패키지의 기본 문구다.
  treeToolbar: '파일 트리 도구',
  newFile: '새 파일',
  newFileInput: '새 파일 이름',
  rename: '이름 바꾸기',
  renameInput: '새 이름',
  delete: '삭제',
  deleteConfirmTitle: '수정한 파일이 함께 지워져요',
  revert: '변경 되돌리기',
  revertConfirmTitle: '변경을 되돌릴까요?',
  revertConfirmAction: '되돌리기',
  modified: '수정됨',
  closeTab: (name: string) => `${name} 닫기`,
  splitRight: '오른쪽으로 나누기',
  binaryNotice: '편집할 수 없는 파일이에요',
  eucKrNotice: 'EUC-KR로 추정되는 파일이라 읽기 전용으로 열었어요.',
  convertToUtf8: 'UTF-8로 바꿔 편집',
} as const;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const header = (page: Page) => page.getByRole('banner');
export const uploadInput = (page: Page) => header(page).getByLabel(text.upload);
export const downloadButton = (page: Page) =>
  header(page).getByRole('button', { name: text.download });
export const tree = (page: Page) => page.getByRole('tree', { name: text.tree });
export const treeItem = (page: Page, name: string) =>
  tree(page).getByRole('treeitem', { name: new RegExp(`^${escapeRegExp(name)}`) });
/**
 * Monaco 에디터와 그 글자 영역은 클래스로 찾는다. 이 파일 밖의 `.monaco-editor`·`.view-lines`도 같은 이유다.
 * - Monaco는 에디터 전체에 역할이나 이름을 붙이지 않는다. 역할이 있는 것은 입력용 `textarea`(role="textbox")
 *   하나인데, 엔진마다 입력 요소가 다르고(EditContext를 쓰는 엔진은 textarea가 없다) 화면 밖 1px 요소라
 *   누를 수도, 보이는 글자를 읽을 수도 없다.
 * - 보이는 글자는 `.view-lines` 안의 줄 div에만 있다. 이 영역도 역할이 없고(aria-hidden), 누르면 그 자리에
 *   커서가 놓인다. 그래서 내용 확인(`toContainText`)과 클릭은 이 두 클래스로 한다.
 */
export const editor = (page: Page) => page.locator('.monaco-editor').first();
/** 에디터에서 글자가 그려지는 영역. 누르면 그 자리에 커서가 놓인다(클래스인 이유는 `editor` 주석). */
export const editorText = (scope: Locator) => scope.locator('.view-lines');
/**
 * dockview가 탭을 끄는 동안 그리는 놓을 자리 표시. 역할도 이름도 없는 장식 요소라 클래스로 찾는다.
 * 탭 끌기가 실제로 시작됐는지 확인할 때만 쓴다.
 */
export const dockDropTarget = (page: Page) =>
  page.locator('.dv-drop-target-selection, .dv-drop-target-anchor').first();
/** dockview 탭. 탭의 접근 가능한 이름은 탭 제목이다. */
export const tab = (page: Page, title: string) =>
  page.getByRole('tab', { name: title, exact: true });
/** 에디터 그룹마다 탭 목록이 하나씩 있다. */
export const tabLists = (page: Page) => page.getByRole('tablist');

/**
 * Monaco가 맥으로 보는 브라우저인지. Monaco는 UA에 'Macintosh'가 있으면 맥 단축키(Cmd)를 쓴다
 * (vs/base/common/platform). Playwright의 WebKit은 Linux에서도 맥 UA를 내므로, 테스트를 도는 OS
 * (`process.platform`, `ControlOrMeta`)가 아니라 브라우저 UA로 키를 골라야 CI의 Linux WebKit에서도 맞다.
 */
export const isMacBrowser = (page: Page): Promise<boolean> =>
  page.evaluate(() => navigator.userAgent.includes('Macintosh'));

/** Monaco 단축키의 Ctrl(맥이면 Cmd) 자리 키. */
export const primaryKey = async (page: Page): Promise<'Meta' | 'Control'> =>
  (await isMacBrowser(page)) ? 'Meta' : 'Control';

/** 활성 에디터에서 파일 맨 앞으로 커서를 옮긴다. Monaco는 맥에서 Cmd+↑, 그 밖에서는 Ctrl+Home이다. */
export async function moveToFileStart(page: Page): Promise<void> {
  await page.keyboard.press((await isMacBrowser(page)) ? 'Meta+ArrowUp' : 'Control+Home');
}

/** 트리 도구 모음의 "새 파일"로 파일을 만든다. 만들면 탭이 열린다. */
export async function createFile(page: Page, name: string): Promise<void> {
  await page
    .getByRole('toolbar', { name: text.treeToolbar })
    .getByRole('button', { name: text.newFile })
    .click();
  await page.getByLabel(text.newFileInput).fill(name);
  await page.keyboard.press('Enter');
  await expect(tab(page, name)).toBeVisible();
}

export async function uploadZip(page: Page, name: string, entries: ZipEntries): Promise<void> {
  // setInputFiles는 disabled를 기다리지 않는다. 잠금 판정·저장본 확인 전(booting)에 넣으면 앱이 무시한다.
  await expect(uploadInput(page)).toBeEnabled();
  await uploadInput(page).setInputFiles({
    name,
    mimeType: 'application/zip',
    buffer: makeZip(entries),
  });
}

/** 트리에서 파일을 눌러 연다. 텍스트 파일이면 에디터가 보인다. */
export async function openFile(page: Page, name: string): Promise<void> {
  await treeItem(page, name).click();
  await expect(editor(page)).toBeVisible();
}

/** 트리 항목을 오른쪽 클릭해 메뉴 항목을 고른다. */
export async function treeMenu(page: Page, name: string, item: string): Promise<void> {
  await treeItem(page, name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** 다운로드 버튼을 눌러 받은 ZIP을 `path`에 저장한다. */
export async function downloadTo(page: Page, path: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton(page).click(),
  ]);
  await download.saveAs(path);
  return download.suggestedFilename();
}

/** 활성 에디터의 끝에 입력한다. */
export async function typeAtEnd(page: Page, value: string): Promise<void> {
  await editorText(editor(page)).click();
  await page.keyboard.press(`${await primaryKey(page)}+End`);
  await page.keyboard.type(value);
}

/**
 * 페이지마다 읽기 전용 연결을 열어 재사용한다.
 * WebKit은 자동화 채널로 건 `indexedDB.open`이 이따금 응답 없이 멈춘다(Monaco가 포커스를 쥐고 있을 때
 * 특히 그렇다 — rAF가 계속 도는 동안 엔진이 그 유휴 틈을 못 준다). 열기 전에 활성 요소의 포커스를 뗀다
 * (앱 쪽 편집 상태는 그대로다, DOM 포커스만 옮긴다). 그래도 한 번씩 멈추는 경우를 대비해, 한 시도가
 * 오래 걸리면 그 연결 시도를 포기하고 다음 `expect.poll` 틱에서 새로 연다 — 그래야 첫 시도가 영영 멈춰도
 * 전체 폴링이 따라 멈추지 않는다.
 */
async function readStore(page: Page, store: 'files' | 'workspace', key: string): Promise<unknown> {
  // 블러와 열기를 한 evaluate 호출에 묶으면 blur의 효과(rAF 루프가 실제로 멎는 것)가 미처 반영되기 전에
  // open이 시작될 수 있다. CDP 왕복을 하나 더 두어 blur가 자리 잡을 시간을 준다.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return page.evaluate(
    ({ storeName, key }) => {
      const w = window as unknown as { __e2eDb?: Promise<IDBDatabase> };
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('codefold');
          // 앱이 DB를 만들기 전이면 여기서 만들지 않는다(버전 1을 빈 DB로 차지하면 앱의 upgrade가 돌지 않는다).
          request.onupgradeneeded = () => request.transaction?.abort();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      const connection = (w.__e2eDb ??= open());
      const withTimeout = Promise.race([
        connection,
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('indexedDB.open이 3초 안에 응답하지 않았다')), 3000),
        ),
      ]).catch((error: unknown) => {
        // 이번 시도를 포기한다. 다음 호출은 새 연결을 새로 연다(늦게 도착한 이전 연결은 버린다).
        if (w.__e2eDb === connection) w.__e2eDb = undefined;
        throw error;
      });
      return withTimeout.then(
        (db) =>
          new Promise<unknown>((resolve, reject) => {
            const read = db.transaction(storeName).objectStore(storeName).get(key);
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
          }),
      );
    },
    { storeName: store, key },
  );
}

/** 앱의 IndexedDB 저장본에 있는 파일 내용. 없으면 undefined. 앱이 ZIP을 연 뒤에만 부른다. */
export async function storedText(page: Page, path: string): Promise<string | undefined> {
  const value = (await readStore(page, 'files', path)) as { text?: string } | undefined;
  return value?.text;
}

/** 저장본 작업 공간의 ZIP 이름. 저장본이 없으면 undefined. */
export async function storedZipName(page: Page): Promise<string | undefined> {
  const value = (await readStore(page, 'workspace', 'current')) as { zipName?: string } | undefined;
  return value?.zipName;
}

export async function storedDownloadRecord(page: Page): Promise<unknown> {
  const value = (await readStore(page, 'workspace', 'current')) as
    { downloadRecord?: unknown } | undefined;
  return value?.downloadRecord ?? null;
}

/** 저장본 `workspace` 저장소의 `current` 기록 그대로. 없으면 undefined. */
export async function storedWorkspace(page: Page): Promise<unknown> {
  return readStore(page, 'workspace', 'current');
}

/** 저장본 작업 공간의 dockview 레이아웃 JSON. 아직 없으면 null. */
export async function storedLayout(page: Page): Promise<unknown> {
  const value = (await storedWorkspace(page)) as { layout?: unknown } | undefined;
  return value?.layout ?? null;
}

/**
 * 저장본 레이아웃의 그룹(격자 잎)마다 든 탭의 경로. 레이아웃이 없으면 빈 배열이다.
 * 모양은 dockview `toJSON()`(grid.root → branch/leaf, panels[id].params.path)을 따른다.
 */
export async function storedLayoutGroups(page: Page): Promise<string[][]> {
  const layout = (await storedLayout(page)) as {
    grid?: { root?: unknown };
    panels?: Record<string, { params?: { path?: string } }>;
  } | null;
  if (!layout?.grid?.root) return [];
  const groups: string[][] = [];
  const walk = (node: unknown) => {
    const { type, data } = (node ?? {}) as { type?: string; data?: unknown };
    if (type === 'branch' && Array.isArray(data)) data.forEach(walk);
    if (type === 'leaf') {
      const views = ((data ?? {}) as { views?: string[] }).views ?? [];
      groups.push(views.map((id) => layout.panels?.[id]?.params?.path ?? id));
    }
  };
  walk(layout.grid.root);
  return groups;
}

/** 저장본 `workspace` 저장소의 `current` 기록을 그대로 덮어쓴다. 기록이 깨진 경우를 흉내 낼 때 쓴다. */
export async function overwriteWorkspaceRecord(page: Page, value: unknown): Promise<void> {
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('codefold');
        request.onupgradeneeded = () => request.transaction?.abort();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put(record, 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    value,
  );
}

/** 브라우저 밖에서 파일을 끌어 온 것처럼 dragenter → dragover → drop을 보낸다. */
export async function dropFiles(
  page: Page,
  files: ReadonlyArray<{ name: string; bytes: Buffer }>,
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    (list) => {
      const transfer = new DataTransfer();
      for (const file of list)
        transfer.items.add(
          new File([new Uint8Array(file.bytes)], file.name, { type: 'application/zip' }),
        );
      return transfer;
    },
    files.map((file) => ({ name: file.name, bytes: [...file.bytes] })),
  );
  await page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await expect(page.getByText(text.dropOverlay)).toBeVisible();
  await page.dispatchEvent('body', 'dragover', { dataTransfer });
  await page.dispatchEvent('body', 'drop', { dataTransfer });
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Tab으로 대상 요소에 포커스가 갈 때까지 누른다. */
export async function tabTo(
  page: Page,
  target: Locator,
  options: { backwards?: boolean } = {},
): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(options.backwards ? 'Shift+Tab' : 'Tab');
  }
  throw new Error('Tab으로 대상에 가지 못했다');
}

/** Tab으로 컨테이너 안쪽에 포커스가 갈 때까지 누른다(Monaco는 입력 요소가 브라우저마다 다르다). */
export async function tabInto(page: Page, container: Locator): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if (await container.evaluate((element) => element.contains(document.activeElement))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab으로 컨테이너 안에 가지 못했다');
}
