import { expect, test } from '@playwright/test';
import {
  collectPageErrors,
  dockDropTarget,
  downloadButton,
  dropFiles,
  editor,
  header,
  openFile,
  tab,
  tabLists,
  text,
  tree,
  treeItem,
  uploadInput,
  uploadZip,
} from './helpers/app.ts';
import { makeZip } from './helpers/zip.ts';

const sample = { 'src/main.py': 'print("hi")\n', 'README.md': '# 제목\n', docs: null } as const;

test.describe('첫 화면과 업로드 (Task 12, 13)', () => {
  test('첫 화면에는 Monaco·dockview 코드가 없고, ZIP을 열 때 내려받는다', async ({ page }) => {
    // 스크립트 요청을 나간 순서대로 적는다. 본문은 Promise로 두었다가 판정 직전에 모두 기다린다.
    const scripts: { path: string; body: Promise<string> }[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() !== 'script') return;
      scripts.push({
        path: new URL(response.url()).pathname,
        body: response.text().catch(() => ''),
      });
    });
    // Monaco 본체와 dockview 코드가 든 청크를 본문 문자열로 가른다. 청크 이름이 바뀌어도 판정은 그대로다.
    const hasMonaco = (body: string) => body.includes('editorWorkerService');
    const hasDockview = (body: string) => body.includes('dv-groupview');
    const bodiesFrom = (start: number) => Promise.all(scripts.slice(start).map(({ body }) => body));

    await page.goto('/', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
    await expect(downloadButton(page)).toBeDisabled();
    const firstScreen = await bodiesFrom(0);
    expect(firstScreen.length).toBeGreaterThan(0);
    expect(firstScreen.some(hasMonaco)).toBe(false);
    expect(firstScreen.some(hasDockview)).toBe(false);

    const beforeUpload = scripts.length;
    await uploadZip(page, 'project.zip', sample);
    await expect(tree(page)).toBeVisible();
    // 올린 뒤에 받은 스크립트에서만 찾는다. 두 코드를 받을 때까지 새로 도착한 응답을 다시 모아 본다.
    await expect
      .poll(async () => {
        const bodies = await bodiesFrom(beforeUpload);
        return [bodies.some(hasMonaco), bodies.some(hasDockview)];
      })
      .toEqual([true, true]);
  });

  test('파일 선택으로 올리면 위에 상단 막대, 왼쪽에 트리, 오른쪽에 에디터가 보인다', async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await treeItem(page, 'src').click();
    await openFile(page, 'main.py');
    await expect(editor(page)).toContainText('print("hi")');
    const [headerBox, treeBox, editorBox] = await Promise.all([
      header(page).boundingBox(),
      tree(page).boundingBox(),
      editor(page).boundingBox(),
    ]);
    if (!headerBox || !treeBox || !editorBox) throw new Error('배치를 재지 못했다');
    expect(treeBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
    expect(treeBox.x + treeBox.width).toBeLessThanOrEqual(editorBox.x + 1);
    // carry-over: 트리 컨테이너 높이가 정해져 있어야 가상화가 행을 그린다.
    expect(treeBox.height).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });

  test('끌어 놓으면 연다. 두 개를 놓으면 안내만 보인다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
    await dropFiles(page, [
      { name: 'a.zip', bytes: makeZip(sample) },
      { name: 'b.zip', bytes: makeZip(sample) },
    ]);
    await expect(page.getByRole('alert')).toContainText(text.multiple);
    await expect(tree(page)).toHaveCount(0);
    await dropFiles(page, [{ name: 'dropped.zip', bytes: makeZip(sample) }]);
    await expect(treeItem(page, 'README.md')).toBeVisible();
  });

  test('ZIP이 아니면 이유를 보이고, 열려 있던 작업 공간은 그대로다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await expect(treeItem(page, 'README.md')).toBeVisible();
    await uploadInput(page).setInputFiles({
      name: 'fake.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('ZIP 아님'),
    });
    // 작업 공간이 열려 있으면 dockview의 빈 assertive 실시간 영역도 role=alert라 이름으로 좁힌다.
    await expect(page.getByRole('alert').filter({ hasText: text.notZip })).toBeVisible();
    await expect(treeItem(page, 'README.md')).toBeVisible();
  });

  test('화면 안에서 탭을 끌면 놓기 영역이 뜨지 않는다(carry-over)', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      '마우스로 HTML5 끌기를 흉내 내는 것은 Chromium에서만 안정적이다',
    );
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await treeItem(page, 'src').click();
    await openFile(page, 'main.py');
    await openFile(page, 'README.md');
    await expect(tabLists(page)).toHaveCount(1);

    const tabBox = await tab(page, 'README.md').boundingBox();
    const groupBox = await page.getByRole('region', { name: 'README.md' }).boundingBox();
    if (!tabBox || !groupBox) throw new Error('탭이나 그룹을 찾지 못했다');
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(groupBox.x + groupBox.width - 12, groupBox.y + groupBox.height / 2, {
      steps: 12,
    });
    // 끌기가 실제로 시작됐다: dockview가 놓을 자리를 그린다. 그래도 파일 놓기 영역은 뜨지 않는다.
    await expect(dockDropTarget(page)).toBeVisible();
    await expect(page.getByText(text.dropOverlay)).toHaveCount(0);
    await page.mouse.up();

    // 놓으면 탭이 오른쪽 새 그룹으로 옮겨지고, 놓을 자리 표시도 사라진다.
    await expect(tabLists(page)).toHaveCount(2);
    await expect(dockDropTarget(page)).toBeHidden();
    await expect(page.getByText(text.dropOverlay)).toHaveCount(0);
  });

  test('좁은 화면에서는 트리가 접는 패널이 되고, 파일을 고르면 닫힌다', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    const toggle = header(page).getByRole('button', { name: text.treeToggle });
    await expect(toggle).toBeVisible();
    await expect(tree(page)).toHaveCount(0);
    await toggle.click();
    await openFile(page, 'README.md');
    await expect(tree(page)).toHaveCount(0);
  });
});
