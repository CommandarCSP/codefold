import { expect, test } from '@playwright/test';
import { readZipFile } from './helpers/archive.ts';
import {
  createFile,
  downloadTo,
  editor,
  editorText,
  openFile,
  tab,
  text,
  tree,
  treeItem,
  typeAtEnd,
  uploadInput,
  uploadZip,
} from './helpers/app.ts';
import type { ZipEntries } from './helpers/zip.ts';

test.describe('한 흐름 (Task 22)', () => {
  // 기능별 확인은 기능마다 둔 E2E가 맡는다. 여기서는 업로드부터 다시 올리기까지 한 번에 지나가는지만 본다.
  test('업로드 → 편집 → 새 파일 → 다운로드 → 다시 올리기를 한 흐름으로 지나간다', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'src/main.py': 'print("hi")\n',
      'README.md': '# 제목\n',
    });
    // 아무것도 고르지 않았을 때 만들어 최상위에 둔다.
    await createFile(page, 'notes.txt');
    await page.keyboard.type('new note');
    await expect(editor(page)).toContainText('new note');
    await treeItem(page, 'src').click();
    await openFile(page, 'main.py');
    await typeAtEnd(page, '# kept edit');

    const saved = testInfo.outputPath('project.zip');
    expect(await downloadTo(page, saved)).toBe('project.zip');

    await uploadInput(page).setInputFiles(saved);
    await expect(treeItem(page, 'notes.txt')).toBeVisible();
    await expect(treeItem(page, 'README.md')).toBeVisible();
    await openFile(page, 'notes.txt');
    await expect(editor(page)).toContainText('new note');
    await treeItem(page, 'src').click();
    await openFile(page, 'main.py');
    await expect(editor(page)).toContainText('# kept edit');
  });

  test('항목 1만 개 ZIP에서도 같은 흐름이 멈추지 않고 동작한다', async ({ page }, testInfo) => {
    test.slow();
    const entries: Record<string, string> = {};
    const filler = 'x'.repeat(100);
    for (let folder = 0; folder < 100; folder += 1)
      for (let file = 0; file < 100; file += 1) {
        const d = String(folder).padStart(3, '0');
        const f = String(file).padStart(4, '0');
        entries[`d${d}/f${f}.ts`] = `export const v${d}_${f} = '${filler}';\n`;
      }
    await page.goto('/');
    await uploadZip(page, 'big.zip', entries);
    await expect(treeItem(page, 'd000')).toBeVisible();

    // 마지막 폴더를 펼쳐 맨 끝 파일을 연다. 가상화된 트리라 키보드로 간다.
    await tree(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(treeItem(page, 'd099')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(tab(page, 'f0099.ts')).toBeVisible();
    await expect(editor(page)).toContainText('v099_0099');
    await typeAtEnd(page, '// edited last');

    // 보이는 행만 그린다.
    expect(await tree(page).getByRole('treeitem').count()).toBeLessThan(200);

    // 다른 폴더의 파일을 열어 탭을 두 개로 만들고 첫 탭으로 돌아온다.
    await tree(page).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(tab(page, 'f0000.ts')).toBeVisible();
    await expect(editor(page)).toContainText('v000_0000');
    await tab(page, 'f0099.ts').click();
    // 트리가 활성 탭의 행까지 스크롤해 강조한다. 두 폴더에 같은 이름이 있어 선택된 행으로 좁힌다.
    const activeRow = tree(page).getByRole('treeitem', { name: /^f0099\.ts/, selected: true });
    await expect(activeRow).toBeInViewport();

    const saved = testInfo.outputPath('big.zip');
    await downloadTo(page, saved);
    // 항목 수와 고치지 않은 파일은 받은 ZIP을 직접 읽어 본다. 화면으로는 1만 개를 셀 수 없다.
    const zip = await readZipFile(saved);
    expect(zip.paths.length).toBeGreaterThanOrEqual(10_000);
    expect(await zip.text('d000/f0000.ts')).toBe(entries['d000/f0000.ts']);

    // 받은 ZIP을 다시 올려 고친 내용이 있는지 앱에서 본다(사용자가 하는 확인과 같다).
    await uploadInput(page).setInputFiles(saved);
    await expect(tab(page, 'f0099.ts')).toHaveCount(0);
    await expect(treeItem(page, 'd000')).toBeVisible();
    await tree(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(treeItem(page, 'd099')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(tab(page, 'f0099.ts')).toBeVisible();
    await expect(editor(page)).toContainText('// edited last');
  });

  test('EUC-KR 파일을 UTF-8로 바꿔 고치면 받은 ZIP에 UTF-8로 들어간다', async ({
    page,
  }, testInfo) => {
    const eucKr: ZipEntries = {
      // "메모: 한글\n"의 "한글"을 EUC-KR(C7 D1 B1 DB)로 쓴다.
      'note.txt': Uint8Array.from([
        ...Buffer.from('memo: '),
        0xc7,
        0xd1,
        0xb1,
        0xdb,
        ...Buffer.from('\n'),
      ]),
    };
    await page.goto('/');
    await uploadZip(page, 'project.zip', eucKr);
    await openFile(page, 'note.txt');

    // 처음에는 읽기 전용이고 "추정" 안내가 있으며, 한글이 깨지지 않는다.
    // 안내 문구 자체가 "EUC-KR로 추정되는"이라 "추정" 표시다.
    const notice = page.getByRole('status').filter({ hasText: text.eucKrNotice });
    await expect(notice).toBeVisible();
    await expect(editor(page)).toContainText('memo: 한글');
    await editorText(editor(page)).click();
    await page.keyboard.type('zzz');
    await expect(editor(page)).not.toContainText('zzz');

    await notice.getByRole('button', { name: text.convertToUtf8 }).click();
    await expect(notice).toHaveCount(0);
    await typeAtEnd(page, 'second line');
    await expect(editor(page)).toContainText('second line');
    await expect(treeItem(page, 'note.txt')).toHaveAccessibleName(/수정됨/);
    await expect(tab(page, 'note.txt')).toContainText(text.modified);

    const saved = testInfo.outputPath('project.zip');
    await downloadTo(page, saved);
    // UTF-8로 엄격하게 읽힌다(fatal 디코더).
    const zip = await readZipFile(saved);
    const written = await zip.text('note.txt');
    expect(written).toContain('memo: 한글');
    expect(written).toContain('second line');

    await uploadInput(page).setInputFiles(saved);
    await openFile(page, 'note.txt');
    await expect(editor(page)).toContainText('memo: 한글');
    await expect(page.getByText(text.eucKrNotice)).toHaveCount(0);
  });
});
