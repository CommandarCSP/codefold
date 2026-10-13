import { expect, test } from '@playwright/test';
import { editor, isMacBrowser, openFile, tab, tree, uploadZip } from './helpers/app.ts';

test.describe('구문 강조와 자동완성 (Task 22)', () => {
  test('한 TS 파일에서 다른 TS 파일이 내보낸 이름을 자동완성한다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'util.ts':
        'export function formatPrice(value: number): string {\n  return `${value}원`;\n}\n',
      'main.ts': "import {  } from './util';\n",
    });
    // 열린 model 전체를 한 프로젝트로 본다. util.ts 탭을 열어 둔 채 main.ts로 옮긴다.
    await openFile(page, 'util.ts');
    await openFile(page, 'main.ts');
    await expect(tab(page, 'util.ts')).toBeVisible();
    await expect(editor(page)).toContainText("from './util'");

    // 괄호 안("import { " 뒤)에 커서를 두고 입력한다. 자동 괄호 닫기와 섞이지 않게 from 절은 파일에 미리 둔다.
    await editor(page).locator('.view-lines').click();
    // 파일 맨 앞으로. Monaco는 맥에서 Cmd+↑, 그 밖에서는 Ctrl+Home이다.
    await page.keyboard.press((await isMacBrowser(page)) ? 'Meta+ArrowUp' : 'Control+Home');
    for (let step = 0; step < 'import { '.length; step += 1)
      await page.keyboard.press('ArrowRight');
    await page.keyboard.type('form');
    // 제안 열기는 맥에서도 Ctrl+Space다(Monaco triggerSuggest).
    await page.keyboard.press('Control+Space');
    // 제안 목록은 Monaco의 listbox이고, 행(option)의 이름은 "후보, 종류"다.
    await expect(page.getByRole('option', { name: /^formatPrice\b/ })).toBeVisible();
  });

  test('언어 청크는 그 언어 파일을 처음 열 때만 내려받는다', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') requested.push(new URL(request.url()).pathname);
    });
    const count = (pattern: RegExp) => requested.filter((path) => pattern.test(path)).length;
    // 청크 이름은 빌드 결과(dist/assets/python-*.js, tsMode-*.js)를 따른다.
    const python = /\/python-[^/]*\.js$/;
    const tsMode = /\/tsMode-[^/]*\.js$/;

    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'a.py': 'a = 1\n',
      'b.py': 'b = 2\n',
      'c.ts': 'export const c = 3;\n',
    });
    await expect(tree(page)).toBeVisible();
    // ZIP을 열면 Monaco 본체를 미리 받는다. 그 뒤에도 언어 청크는 없다.
    await expect.poll(() => count(/\/editor\.api-[^/]*\.js$/)).toBeGreaterThan(0);
    expect(count(python)).toBe(0);
    expect(count(tsMode)).toBe(0);

    await openFile(page, 'a.py');
    await expect(editor(page)).toContainText('a = 1');
    await expect.poll(() => count(python)).toBe(1);
    await openFile(page, 'b.py');
    await expect(editor(page)).toContainText('b = 2');
    // 언어 청크 요청은 model을 만들 때 나간다. 내용이 보였으면 요청했을 때가 지났다.
    expect(count(python)).toBe(1);
    expect(count(tsMode)).toBe(0);

    await openFile(page, 'c.ts');
    await expect(editor(page)).toContainText('export const c');
    await expect.poll(() => count(tsMode)).toBe(1);
    expect(count(python)).toBe(1);
  });
});
