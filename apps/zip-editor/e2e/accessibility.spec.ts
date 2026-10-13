import { expect, test } from '@playwright/test';
import {
  downloadButton,
  editor,
  isMacBrowser,
  openFile,
  primaryKey,
  tabInto,
  tabTo,
  text,
  tree,
  uploadInput,
  uploadZip,
} from './helpers/app.ts';
import { readZipFile } from './helpers/archive.ts';
import { makeZip } from './helpers/zip.ts';

test.describe('접근성과 브라우저 지원 (Task 18)', () => {
  test('마우스 없이 업로드 → 파일 열기 → 편집 → 다운로드를 할 수 있다', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName === 'webkit' && process.platform === 'darwin',
      'macOS의 WebKit은 시스템 설정 때문에 Tab이 버튼을 건너뛴다. Linux CI의 WebKit은 돈다',
    );
    await page.goto('/');
    await tabTo(page, uploadInput(page));
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Space');
    await (
      await chooser
    ).setFiles({
      name: 'project.zip',
      mimeType: 'application/zip',
      buffer: makeZip({ 'main.py': 'x = 1\n' }),
    });
    await tabTo(page, tree(page));
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(editor(page)).toBeVisible();
    await tabInto(page, editor(page));
    await page.keyboard.press(`${await primaryKey(page)}+End`);
    await page.keyboard.type('\ny = 2');
    // Monaco는 Tab을 입력으로 받는다. 이 단축키로 Tab이 포커스를 옮기게 바꾼다.
    await page.keyboard.press((await isMacBrowser(page)) ? 'Control+Shift+M' : 'Control+M');
    await tabTo(page, downloadButton(page), { backwards: true });
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const received = await download;
    expect(received.suggestedFilename()).toBe('project.zip');
    const saved = testInfo.outputPath('project.zip');
    await received.saveAs(saved);
    expect(await (await readZipFile(saved)).text('main.py')).toContain('y = 2');
  });

  test('버튼마다 접근 가능한 이름이 있다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'main.py': 'x = 1\n' });
    await openFile(page, 'main.py');
    for (const button of await page.getByRole('button').all())
      await expect(button).toHaveAccessibleName(/\S/);
  });

  test('ZIP 안 SVG·HTML은 DOM에 들어가거나 실행되지 않는다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'evil.svg':
        '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__svgRan = true</script><rect width="4" height="4"/></svg>',
      'page.html': '<script>window.__htmlRan = true</script>',
    });
    await tree(page)
      .getByRole('treeitem', { name: /^evil\.svg/ })
      .click();
    await expect(page.getByRole('img', { name: 'evil.svg' })).toBeVisible();
    // SVG를 띄운 동안 그 안의 script가 DOM에 없어야 한다(<img>로만 그린다).
    await expect(page.locator('svg script')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__svgRan'))).toBeUndefined();
    await openFile(page, 'page.html');
    await expect(page.locator('svg script')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__svgRan'))).toBeUndefined();
    expect(await page.evaluate(() => Reflect.get(window, '__htmlRan'))).toBeUndefined();
  });

  test('필요한 기능이 없으면 앱 대신 지원 안내만 보인다', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'locks', {
        configurable: true,
        get: () => undefined,
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: text.unsupported })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
