import { expect, test, type Page } from '@playwright/test';
import { readZipFile } from './helpers/archive.ts';
import {
  createFile,
  downloadButton,
  downloadTo,
  editor,
  openFile,
  storedText,
  tab,
  text,
  tree,
  treeItem,
  treeMenu,
  typeAtEnd,
  uploadZip,
} from './helpers/app.ts';

/** 1×1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
);
/** 글자가 아닌 바이트(NUL)가 섞인 16바이트. */
const BINARY = Uint8Array.from([0, 1, 2, 3, 0xff, 0, 0x10, 0x20, 0, 0x7f, 0x80, 0, 0xfe, 9, 0, 1]);
/** 맥이 만드는 AppleDouble(`._*`)과 `.DS_Store`를 흉내 낸 바이트. 내용은 상관없고 그대로 나오는지만 본다. */
const APPLE_DOUBLE = Uint8Array.from([0, 5, 22, 7, 0, 2, 0, 0]);
const DS_STORE = Uint8Array.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31, 0, 0, 0x10, 0]);

/** 에디터 안에 포커스가 있는지(Monaco의 입력 요소는 엔진마다 다르다). */
const editorHasFocus = (page: Page) =>
  editor(page).evaluate((element) => element.contains(document.activeElement));

/** 최상위 트리 항목의 이름을 트리가 매긴 순서(aria-posinset)대로 돌려준다. */
async function topLevelNames(page: Page): Promise<string[]> {
  const rows = await tree(page)
    .getByRole('treeitem', { level: 1 })
    .evaluateAll((elements) =>
      elements.map((element) => ({
        position: Number(element.getAttribute('aria-posinset')),
        name: element.textContent ?? '',
      })),
    );
  return rows.sort((a, b) => a.position - b.position).map(({ name }) => name);
}

test.describe('트리와 파일 종류별 보기 (Task 22)', () => {
  test('처음 트리는 최상위 항목만 정렬해 보이고, 맥 부가 파일은 숨긴다. 폴더는 눌러 펼치고 접는다', async ({
    page,
  }) => {
    await page.goto('/');
    // 폴더 항목 없이 파일 경로만 든 ZIP이다. 넘기는 순서도 정렬과 다르게 섞는다.
    await uploadZip(page, 'project.zip', {
      'readme.md': '# 설명\n',
      'src/b.py': 'b = 1\n',
      'src/._b.py': APPLE_DOUBLE,
      'file10.txt': 'ten\n',
      'lib/util.py': 'u = 1\n',
      'file2.txt': 'two\n',
      '.DS_Store': DS_STORE,
      '__MACOSX/._file2.txt': APPLE_DOUBLE,
    });

    // 폴더 먼저, 파일은 이름순이고 숫자는 자연 정렬이다. 부가 파일은 트리에 없다.
    await expect
      .poll(() => topLevelNames(page))
      .toEqual(['lib', 'src', 'file2.txt', 'file10.txt', 'readme.md']);
    await expect(treeItem(page, '__MACOSX')).toHaveCount(0);
    await expect(treeItem(page, '.DS_Store')).toHaveCount(0);
    // 처음에는 모든 폴더가 접혀 있다.
    await expect(treeItem(page, 'src')).toHaveAttribute('aria-expanded', 'false');
    await expect(treeItem(page, 'lib')).toHaveAttribute('aria-expanded', 'false');
    await expect(treeItem(page, 'b.py')).toHaveCount(0);
    await expect(treeItem(page, 'util.py')).toHaveCount(0);

    // 폴더를 누르면 펼치고, 한 번 더 누르면 접는다. 폴더 안의 `._*`도 숨긴다.
    await treeItem(page, 'src').click();
    await expect(treeItem(page, 'src')).toHaveAttribute('aria-expanded', 'true');
    await expect(tree(page).getByRole('treeitem', { name: /^b\.py/, level: 2 })).toBeVisible();
    await expect(treeItem(page, '._b.py')).toHaveCount(0);
    await treeItem(page, 'src').click();
    await expect(treeItem(page, 'src')).toHaveAttribute('aria-expanded', 'false');
    await expect(treeItem(page, 'b.py')).toHaveCount(0);
  });

  test('PNG는 이미지로, 바이너리는 편집 불가 안내와 크기·판단 근거로 보인다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'logo.png': PNG, 'data.bin': BINARY });

    await treeItem(page, 'logo.png').click();
    const image = page.getByRole('img', { name: 'logo.png' });
    await expect(image).toBeVisible();
    // 실제로 그림이 풀렸는지 본다(깨진 이미지는 naturalWidth가 0이다).
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(1);
    await expect(tab(page, 'logo.png')).toBeVisible();

    await treeItem(page, 'data.bin').click();
    await expect(tab(page, 'data.bin')).toBeVisible();
    await expect(page.getByText(text.binaryNotice)).toBeVisible();
    await expect(page.getByText(/크기 16 B · 판단 근거: \S/)).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    // 보기만 했으므로 원본과 같다. 받을 것이 없다.
    await expect(downloadButton(page)).toBeDisabled();
  });

  test('고른 폴더 안에 새 파일을 만들면 탭이 열리고 곧바로 입력할 수 있다. Esc는 만들지 않는다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'src/main.py': 'print("hi")\n',
      'README.md': '# 제목\n',
    });
    const newFileButton = page
      .getByRole('toolbar', { name: text.treeToolbar })
      .getByRole('button', { name: text.newFile });

    // Esc로 취소하면 아무것도 생기지 않는다.
    await newFileButton.click();
    await page.getByLabel(text.newFileInput).fill('draft.txt');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel(text.newFileInput)).toHaveCount(0);
    await expect(treeItem(page, 'draft.txt')).toHaveCount(0);
    await expect(tab(page, 'draft.txt')).toHaveCount(0);

    // 폴더를 고른 채 만들면 그 폴더 안에 생긴다.
    await treeItem(page, 'src').click();
    await createFile(page, 'notes.txt');
    await expect(tree(page).getByRole('treeitem', { name: /^notes\.txt/, level: 2 })).toBeVisible();
    await expect(downloadButton(page)).toBeEnabled();

    // 새 파일은 빈 텍스트로 열리고 에디터에 포커스가 간다. 누르지 않고 바로 입력한다.
    await expect.poll(() => editorHasFocus(page)).toBe(true);
    await page.keyboard.type('hello');
    await expect(editor(page)).toContainText('hello');
    await expect.poll(() => storedText(page, 'src/notes.txt')).toBe('hello');
  });

  test('열린 파일의 이름을 바꾸면 탭 제목과 수정 표시가 따라가고, 지우면 모든 그룹에서 탭이 닫힌다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'a.py': 'a = 1\n',
      'c.py': 'c = 1\n',
      'old/legacy.py': 'legacy = 1\n',
    });

    // 고친 파일의 이름을 바꾸면 같은 탭이 새 이름으로 바뀌고 수정 표시와 내용이 따라간다.
    await openFile(page, 'a.py');
    await typeAtEnd(page, '#edit');
    await expect(tab(page, 'a.py')).toContainText(text.modified);
    await treeMenu(page, 'a.py', text.rename);
    await page.getByLabel(text.renameInput).fill('b.py');
    await page.keyboard.press('Enter');
    await expect(tab(page, 'a.py')).toHaveCount(0);
    await expect(tab(page, 'b.py')).toBeVisible();
    await expect(tab(page, 'b.py')).toContainText(text.modified);
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(treeItem(page, 'b.py')).toHaveAccessibleName(/수정됨/);
    await expect(treeItem(page, 'a.py')).toHaveCount(0);
    await expect(editor(page)).toContainText('#edit');

    // 고치지 않은 파일은 묻지 않고 지우고, 열린 탭도 닫는다.
    await openFile(page, 'c.py');
    await treeMenu(page, 'c.py', text.delete);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(treeItem(page, 'c.py')).toHaveCount(0);
    await expect(tab(page, 'c.py')).toHaveCount(0);

    // 고친 파일이 든 폴더는 확인창을 거친다. 취소하면 그대로다.
    await treeItem(page, 'old').click();
    await openFile(page, 'legacy.py');
    await typeAtEnd(page, '#lost');
    await page.getByRole('button', { name: text.splitRight }).first().click();
    const legacyTabs = page.getByRole('tab', { name: 'legacy.py', exact: true });
    await expect(legacyTabs).toHaveCount(2);
    const confirm = page.getByRole('alertdialog', { name: text.deleteConfirmTitle });
    await treeMenu(page, 'old', text.delete);
    await confirm.getByRole('button', { name: text.cancel }).click();
    await expect(confirm).toHaveCount(0);
    await expect(treeItem(page, 'old')).toBeVisible();
    await expect(legacyTabs).toHaveCount(2);

    // 확인하면 폴더와 그 안의 파일이 지워지고, 두 그룹의 탭이 모두 닫힌다.
    await treeMenu(page, 'old', text.delete);
    await confirm.getByRole('button', { name: text.delete }).click();
    await expect(treeItem(page, 'old')).toHaveCount(0);
    await expect(treeItem(page, 'legacy.py')).toHaveCount(0);
    await expect(legacyTabs).toHaveCount(0);
    await expect(tab(page, 'b.py')).toBeVisible();
  });

  test('받은 ZIP에는 고친 파일만 바뀌고, 바이너리·이미지·부가 파일은 원본 바이트 그대로 들어간다', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'src/main.py': 'print("hi")\n',
      'src/.DS_Store': DS_STORE,
      'src/._main.py': APPLE_DOUBLE,
      'old/x.py': 'x = 1\n',
      'old/._x.py': APPLE_DOUBLE,
      'logo.png': PNG,
      'data.bin': BINARY,
      'plain.txt': '그대로\n',
      '.DS_Store': DS_STORE,
      '__MACOSX/._main.py': APPLE_DOUBLE,
    });

    // 여는 것만으로는 바뀌지 않는다.
    await treeItem(page, 'logo.png').click();
    await expect(page.getByRole('img', { name: 'logo.png' })).toBeVisible();
    await treeItem(page, 'data.bin').click();
    await expect(page.getByText(text.binaryNotice)).toBeVisible();
    await openFile(page, 'plain.txt');

    await treeItem(page, 'src').click();
    await openFile(page, 'main.py');
    await typeAtEnd(page, '# edited');
    // 폴더 이름을 바꾸면 그 안의 부가 파일도 새 경로로 옮기고, 폴더를 지우면 함께 빠진다.
    await treeMenu(page, 'src', text.rename);
    await page.getByLabel(text.renameInput).fill('app');
    await page.keyboard.press('Enter');
    await expect(treeItem(page, 'app')).toBeVisible();
    await treeMenu(page, 'old', text.delete);
    await expect(treeItem(page, 'old')).toHaveCount(0);

    const saved = testInfo.outputPath('project.zip');
    await downloadTo(page, saved);
    const zip = await readZipFile(saved);
    const files = zip.entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path);
    expect([...files].sort()).toEqual(
      [
        '.DS_Store',
        '__MACOSX/._main.py',
        'app/.DS_Store',
        'app/._main.py',
        'app/main.py',
        'data.bin',
        'logo.png',
        'plain.txt',
      ].sort(),
    );
    expect(await zip.text('app/main.py')).toBe('print("hi")\n# edited');
    expect(await zip.bytes('plain.txt')).toEqual(Uint8Array.from(Buffer.from('그대로\n')));
    expect(await zip.bytes('data.bin')).toEqual(BINARY);
    expect(await zip.bytes('logo.png')).toEqual(PNG);
    expect(await zip.bytes('.DS_Store')).toEqual(DS_STORE);
    expect(await zip.bytes('app/.DS_Store')).toEqual(DS_STORE);
    expect(await zip.bytes('app/._main.py')).toEqual(APPLE_DOUBLE);
    expect(await zip.bytes('__MACOSX/._main.py')).toEqual(APPLE_DOUBLE);
  });
});
