import { expect, test, type Page } from '@playwright/test';
import { readZipFile } from './helpers/archive.ts';
import {
  downloadButton,
  downloadTo,
  editor,
  openFile,
  overwriteWorkspaceRecord,
  primaryKey,
  storedLayoutGroups,
  storedText,
  storedWorkspace,
  storedZipName,
  tab,
  tabLists,
  text,
  treeItem,
  treeMenu,
  typeAtEnd,
  uploadZip,
} from './helpers/app.ts';

async function resume(page: Page, zipName = 'project.zip') {
  const dialog = page.getByRole('dialog', { name: text.restoreTitle });
  await expect(dialog).toContainText(zipName);
  await dialog.getByRole('button', { name: text.resume }).click();
}

/**
 * 탭이 숨겨진 것처럼 visibilityState를 hidden으로 바꾸고 visibilitychange를 보낸다.
 * 헤드리스 세 엔진 모두 다른 페이지를 앞으로 가져와도(bringToFront) 숨김으로 바뀌지 않아 흉내 낸다(2026-09-28 확인).
 */
async function hideTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('자동 저장·복원과 작업 공간 교체 (Task 22)', () => {
  test('트리 변경과 분할 배치가 새로고침 뒤 되살아나고, 이어서 고친 뒤 받은 ZIP에 모두 들어간다', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', {
      'keep.py': 'k = 1\n',
      'rename.py': 'r = 1\n',
      'gone.py': 'g = 1\n',
    });
    await openFile(page, 'keep.py');
    await typeAtEnd(page, '#before');

    await page
      .getByRole('toolbar', { name: text.treeToolbar })
      .getByRole('button', { name: text.newFile })
      .click();
    await page.getByLabel(text.newFileInput).fill('added.py');
    await page.keyboard.press('Enter');
    await expect(tab(page, 'added.py')).toBeVisible();
    await typeAtEnd(page, '#added');

    await treeMenu(page, 'rename.py', text.rename);
    await page.getByLabel(text.renameInput).fill('renamed.py');
    await page.keyboard.press('Enter');
    await expect(treeItem(page, 'renamed.py')).toBeVisible();
    await treeMenu(page, 'gone.py', text.delete);
    await expect(treeItem(page, 'gone.py')).toHaveCount(0);

    await tab(page, 'keep.py').click();
    await page.getByRole('button', { name: text.splitRight }).click();
    await expect(tabLists(page)).toHaveCount(2);

    // 새로고침 전에 저장이 끝나기를 기다린다. 레이아웃은 묶어서 쓰므로 저장본의 레이아웃 칸을 본다(원장 "정한 것" 3).
    await expect.poll(() => storedText(page, 'keep.py')).toContain('#before');
    await expect.poll(() => storedText(page, 'added.py')).toContain('#added');
    await expect
      .poll(() => storedLayoutGroups(page))
      .toEqual([['keep.py', 'added.py'], ['keep.py']]);
    expect(await storedZipName(page)).toBe('project.zip');

    await page.reload();
    await resume(page);
    await expect(treeItem(page, 'added.py')).toBeVisible();
    await expect(treeItem(page, 'renamed.py')).toBeVisible();
    await expect(treeItem(page, 'rename.py')).toHaveCount(0);
    await expect(treeItem(page, 'gone.py')).toHaveCount(0);
    await expect(tabLists(page)).toHaveCount(2);
    await expect(page.getByRole('tab', { name: 'keep.py', exact: true })).toHaveCount(2);
    await expect(tab(page, 'added.py')).toHaveCount(1);
    // 그룹마다 탭 구성도 그대로다: 한 그룹에 keep.py·added.py, 나머지 그룹에 keep.py 하나.
    const withAdded = tabLists(page).filter({ has: tab(page, 'added.py') });
    const other = tabLists(page).filter({ hasNot: tab(page, 'added.py') });
    await expect(withAdded).toHaveCount(1);
    await expect(withAdded.getByRole('tab')).toHaveCount(2);
    await expect(withAdded.getByRole('tab', { name: 'keep.py', exact: true })).toHaveCount(1);
    await expect(other).toHaveCount(1);
    await expect(other.getByRole('tab')).toHaveCount(1);
    await expect(other.getByRole('tab', { name: 'keep.py', exact: true })).toHaveCount(1);

    // 활성 그룹에 열린다. 그 그룹(이름이 활성 탭 제목인 region)의 에디터에 입력한다.
    await openFile(page, 'renamed.py');
    const group = page.getByRole('region', { name: 'renamed.py' });
    await group.locator('.view-lines').click();
    await page.keyboard.press(`${await primaryKey(page)}+End`);
    await page.keyboard.type('#after');
    await expect(group).toContainText('#after');

    const saved = testInfo.outputPath('project.zip');
    await downloadTo(page, saved);
    const zip = await readZipFile(saved);
    expect([...zip.paths].sort()).toEqual(['added.py', 'keep.py', 'renamed.py']);
    expect(await zip.text('keep.py')).toBe('k = 1\n#before');
    expect(await zip.text('added.py')).toBe('#added');
    expect(await zip.text('renamed.py')).toBe('r = 1\n#after');
  });

  test('받지 않은 변경이 있을 때 새 ZIP을 올리면 확인하고, 취소하면 그대로, 확인하면 바꾼다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'first.zip', { 'main.py': 'old = 1\n' });
    await openFile(page, 'main.py');
    await typeAtEnd(page, '#dirty');
    await expect(page.getByText(text.unexported(1))).toBeVisible();
    await expect.poll(() => storedText(page, 'main.py')).toContain('#dirty');

    const second = { 'next.py': 'n = 1\n' };
    const confirm = page.getByRole('alertdialog', { name: text.replaceTitle });
    await uploadZip(page, 'second.zip', second);
    await confirm.getByRole('button', { name: text.cancel }).click();
    await expect(confirm).toHaveCount(0);
    await expect(treeItem(page, 'main.py')).toBeVisible();
    await expect(treeItem(page, 'next.py')).toHaveCount(0);
    await expect(editor(page)).toContainText('#dirty');
    await expect(page.getByText(text.unexported(1))).toBeVisible();

    await uploadZip(page, 'second.zip', second);
    await confirm.getByRole('button', { name: text.replaceConfirm }).click();
    await expect(treeItem(page, 'next.py')).toBeVisible();
    await expect(treeItem(page, 'main.py')).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText(/받지 않은 변경/)).toHaveCount(0);
    await expect.poll(() => storedZipName(page)).toBe('second.zip');
    expect(await storedText(page, 'main.py')).toBeUndefined();
  });

  test('변경 되돌리기는 확인창을 거쳐 원본으로 돌리고 저장본에서도 지운다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'main.py': 'print("hi")\n' });
    await openFile(page, 'main.py');
    await typeAtEnd(page, '#revert');
    await expect.poll(() => storedText(page, 'main.py')).toContain('#revert');

    await treeMenu(page, 'main.py', text.revert);
    const confirm = page.getByRole('alertdialog', { name: text.revertConfirmTitle });
    await confirm.getByRole('button', { name: text.revertConfirmAction }).click();
    await expect(confirm).toHaveCount(0);

    await expect(editor(page)).not.toContainText('#revert');
    await expect(editor(page)).toContainText('print("hi")');
    await expect(treeItem(page, 'main.py')).not.toHaveAccessibleName(/수정됨/);
    await expect(tab(page, 'main.py')).not.toContainText(text.modified);
    await expect(downloadButton(page)).toBeDisabled();

    // 실행 취소 기록도 원본에서 새로 시작한다.
    await editor(page).locator('.view-lines').click();
    await page.keyboard.press(`${await primaryKey(page)}+z`);
    await expect(editor(page)).toContainText('print("hi")');
    await expect(editor(page)).not.toContainText('#revert');
    await expect.poll(() => storedText(page, 'main.py')).toBeUndefined();
  });

  test('저장본이 손상됐으면 곧바로 복원 실패 안내가 뜨고, 다시 시도·버리기를 고를 수 있다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'main.py': 'a = 1\n' });
    await openFile(page, 'main.py');
    await typeAtEnd(page, '#saved');
    await expect.poll(() => storedText(page, 'main.py')).toContain('#saved');
    // 레이아웃까지 쓴 뒤에 깨뜨린다. 늦게 온 레이아웃 저장이 실패해 이탈 경고가 뜨지 않게 한다.
    await expect.poll(() => storedLayoutGroups(page)).toEqual([['main.py']]);
    const broken = { broken: true };
    await overwriteWorkspaceRecord(page, broken);

    await page.reload();
    // 저장본 요약을 읽을 때 기록 모양을 확인하므로, 복원 안내 없이 곧바로 실패 안내가 뜬다(원장과 다른 점, 보고 참고).
    const failure = page.getByRole('alert').filter({ hasText: text.restoreFailedTitle });
    await expect(failure).toBeVisible();
    await expect(page.getByRole('dialog', { name: text.restoreTitle })).toHaveCount(0);
    await expect(failure.getByRole('button', { name: text.retry })).toBeVisible();
    await expect(failure.getByRole('button', { name: text.discard })).toBeVisible();

    await failure.getByRole('button', { name: text.retry }).click();
    await expect(failure).toBeVisible();
    expect(await storedWorkspace(page)).toEqual(broken);

    await failure.getByRole('button', { name: text.discard }).click();
    await expect(page.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
    await expect(failure).toHaveCount(0);
    await expect.poll(() => storedWorkspace(page)).toBeUndefined();
  });

  test('입력 직후 브라우저 탭이 숨겨지면 1초를 기다리지 않고 저장한다', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/');
    await uploadZip(page, 'project.zip', { 'main.py': 'a = 1\n' });
    await openFile(page, 'main.py');
    // 마지막 키 입력 시각을 페이지 시계로 적는다. 저장 시각과 같은 시계로 비교해야 한다.
    await page.evaluate(() => {
      document.addEventListener(
        'keydown',
        () => Reflect.set(window, '__lastKeyAt', performance.now()),
        true,
      );
    });
    await typeAtEnd(page, '#hidden');
    await hideTab(page);

    // 저장본에 들어갈 때까지 페이지 안에서 읽어 본다. 마지막 입력부터 걸린 시간(ms)을 돌려준다.
    const elapsed = await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('codefold');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const read = () =>
        new Promise<{ text?: string } | undefined>((resolve, reject) => {
          const request = db.transaction('files').objectStore('files').get('main.py');
          request.onsuccess = () => resolve(request.result as { text?: string } | undefined);
          request.onerror = () => reject(request.error);
        });
      const lastKeyAt = Reflect.get(window, '__lastKeyAt') as number;
      while (performance.now() - lastKeyAt < 3000) {
        if ((await read())?.text?.includes('#hidden')) {
          const took = performance.now() - lastKeyAt;
          db.close();
          return took;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      db.close();
      return Number.POSITIVE_INFINITY;
    });
    // 숨김이 없으면 마지막 입력 뒤 1초(AUTOSAVE_QUIET_MS) 동안 쓰지 않는다.
    expect(elapsed).toBeLessThan(1000);

    await page.close({ runBeforeUnload: false });
    const again = await context.newPage();
    await again.goto('/');
    await resume(again);
    await openFile(again, 'main.py');
    await expect(editor(again)).toContainText('#hidden');
  });
});
