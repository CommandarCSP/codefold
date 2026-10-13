import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  downloadButton,
  editor,
  openFile,
  primaryKey,
  tab,
  tabLists,
  text,
  treeItem,
  typeAtEnd,
  uploadZip,
} from './helpers/app.ts';

/** 보이는 에디터를 왼쪽부터 늘어놓는다. */
async function editorsLeftToRight(page: Page): Promise<Locator[]> {
  const editors = page.locator('.monaco-editor');
  await expect(editors).toHaveCount(2);
  const boxes = await Promise.all(
    [0, 1].map(async (index) => ({
      index,
      x: (await editors.nth(index).boundingBox())?.x ?? 0,
    })),
  );
  return boxes.sort((a, b) => a.x - b.x).map(({ index }) => editors.nth(index));
}

/** 활성 탭을 그룹 머리의 "오른쪽으로 나누기"로 오른쪽 새 그룹에 하나 더 연다. */
async function splitRight(page: Page): Promise<void> {
  await page.getByRole('button', { name: text.splitRight }).first().click();
  await expect(tabLists(page)).toHaveCount(2);
}

async function clickEditor(target: Locator): Promise<void> {
  await target.locator('.view-lines').click();
}

test.describe('탭과 에디터 영역 (Task 22)', () => {
  test('탭을 그룹 오른쪽 가장자리에 끌어 놓으면 에디터 영역이 좌우로 나뉜다', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      '마우스로 HTML5 끌기를 흉내 내는 것은 Chromium에서만 안정적이다(원장 "정한 것" 5)',
    );
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'a.ts': 'export const a = 1;\n',
      'b.ts': 'export const b = 2;\n',
    });
    await openFile(page, 'a.ts');
    await openFile(page, 'b.ts');
    await expect(tabLists(page)).toHaveCount(1);

    const tabBox = await tab(page, 'b.ts').boundingBox();
    const groupBox = await page.getByRole('region', { name: 'b.ts' }).boundingBox();
    if (!tabBox || !groupBox) throw new Error('탭이나 그룹을 찾지 못했다');
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(groupBox.x + groupBox.width - 12, groupBox.y + groupBox.height / 2, {
      steps: 12,
    });
    await expect(page.getByText(text.dropOverlay)).toHaveCount(0);
    await page.mouse.up();

    await expect(tabLists(page)).toHaveCount(2);
    const [left, right] = await editorsLeftToRight(page);
    await expect(left!).toContainText('export const a');
    await expect(right!).toContainText('export const b');
  });

  test('두 그룹 사이 경계를 끌면 에디터가 새 크기에 맞춰 다시 그려진다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'long.py': 'ruler = 1\n' });
    await openFile(page, 'long.py');
    await splitRight(page);
    const [, right] = await editorsLeftToRight(page);

    // 오른쪽 에디터에서 보이는 폭보다 약 100px 긴 줄을 만든다. 글자 폭은 엔진·글꼴마다 달라 재서 정한다.
    const metrics = await right!.evaluate((element) => {
      const lines = element.querySelector('.view-lines')!.getBoundingClientRect();
      const minimap = element.querySelector('.minimap')?.getBoundingClientRect();
      const ruler = element.querySelector('.view-line')!;
      const rulerText = ruler.textContent ?? '';
      const range = document.createRange();
      range.selectNodeContents(ruler);
      const width = range.getBoundingClientRect().width;
      const visibleRight = minimap && minimap.width > 0 ? minimap.left : lines.right;
      return { charWidth: width / rulerText.length, visibleWidth: visibleRight - lines.left };
    });
    const length = Math.ceil((metrics.visibleWidth + 100) / metrics.charWidth);
    await clickEditor(right!);
    await page.keyboard.press(`${await primaryKey(page)}+End`);
    await page.keyboard.type(`\n${'x'.repeat(length - 9)}#TAIL_END`);
    // 커서를 줄 앞으로 옮겨 가로 스크롤을 처음으로 돌린다(입력하며 줄 끝까지 스크롤했다).
    await page.keyboard.press('Home');
    // 파이썬 주석은 따로 토큰이 되어 자기 span을 가진다. span이 잘리지 않고 보이는지로 "줄 끝이 보이는지"를 본다.
    const tail = right!.getByText('#TAIL_END', { exact: true });
    await expect(tail).toBeAttached();
    await expect(tail).not.toBeInViewport({ ratio: 1 });
    const before = (await right!.boundingBox())?.width ?? 0;

    // dockview의 경계(sash)는 역할이 없어 클래스로 찾는다. 두 그룹 사이에 있는 것을 고른다.
    const rightBox = await right!.boundingBox();
    if (!rightBox) throw new Error('오른쪽 에디터를 재지 못했다');
    const sashes = page.locator('.dv-sash');
    let sashBox: { x: number; y: number; width: number; height: number } | null = null;
    for (const sash of await sashes.all()) {
      const box = await sash.boundingBox();
      if (box && box.height > 0 && Math.abs(box.x + box.width / 2 - rightBox.x) < 20) sashBox = box;
    }
    if (!sashBox) throw new Error('두 그룹 사이 경계를 찾지 못했다');
    const x = sashBox.x + sashBox.width / 2;
    const y = sashBox.y + sashBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 200, y, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => (await right!.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before + 190);
    expect((await right!.boundingBox())?.width ?? 0).toBeLessThan(before + 210);
    await expect(tail).toBeInViewport({ ratio: 1 });
  });

  test('두 그룹에 띄운 같은 파일에서 실제 키 입력과 undo·redo가 양쪽에 같이 반영된다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'main.py': 'print("hi")\n' });
    await openFile(page, 'main.py');
    await splitRight(page);
    const [left, right] = await editorsLeftToRight(page);
    const tabs = page.getByRole('tab', { name: 'main.py', exact: true });
    await expect(tabs).toHaveCount(2);

    await clickEditor(left!);
    await page.keyboard.press(`${await primaryKey(page)}+End`);
    await page.keyboard.type('#both');
    await expect(right!).toContainText('#both');
    for (const each of await tabs.all()) await expect(each).toContainText(text.modified);
    await expect(downloadButton(page)).toBeEnabled();

    const mod = await primaryKey(page);
    await clickEditor(right!);
    await page.keyboard.press(`${mod}+z`);
    await expect(left!).not.toContainText('#both');
    await expect(right!).not.toContainText('#both');
    for (const each of await tabs.all()) await expect(each).not.toContainText(text.modified);
    await expect(downloadButton(page)).toBeDisabled();

    await page.keyboard.press(`${mod}+Shift+z`);
    await expect(left!).toContainText('#both');
    await expect(right!).toContainText('#both');
    for (const each of await tabs.all()) await expect(each).toContainText(text.modified);
    await expect(downloadButton(page)).toBeEnabled();
  });

  test('고친 파일의 탭을 닫았다 다시 열면 내용과 undo 기록이 이어진다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'main.py': 'print("hi")\n' });
    await openFile(page, 'main.py');
    await typeAtEnd(page, '#kept');
    await tab(page, 'main.py')
      .getByRole('button', { name: text.closeTab('main.py') })
      .click();
    await expect(tab(page, 'main.py')).toHaveCount(0);
    await expect(treeItem(page, 'main.py')).toHaveAccessibleName(/수정됨/);

    await openFile(page, 'main.py');
    await expect(editor(page)).toContainText('#kept');
    await clickEditor(editor(page));
    await page.keyboard.press(`${await primaryKey(page)}+z`);
    await expect(editor(page)).not.toContainText('#kept');
    await expect(editor(page)).toContainText('print("hi")');
    await expect(treeItem(page, 'main.py')).not.toHaveAccessibleName(/수정됨/);
  });
});
