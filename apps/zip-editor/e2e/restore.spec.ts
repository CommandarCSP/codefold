import { expect, test, type Page } from '@playwright/test';
import {
  downloadButton,
  editor,
  editorText,
  moveToFileStart,
  openFile,
  primaryKey,
  storedDownloadRecord,
  storedText,
  storedZipName,
  text,
  treeItem,
  typeAtEnd,
  uploadZip,
} from './helpers/app.ts';

const sample = { 'main.py': 'a = 1\n', 'other.py': 'b = 2\n' } as const;

async function editAndWaitSaved(page: Page, name: string, value: string) {
  await openFile(page, name);
  await typeAtEnd(page, value);
  await expect.poll(() => storedText(page, name)).toContain(value);
}

async function resume(page: Page) {
  const dialog = page.getByRole('dialog', { name: text.restoreTitle });
  await expect(dialog).toContainText('project.zip');
  await dialog.getByRole('button', { name: text.resume }).click();
}

test.describe('자동 저장과 복원 (Task 16, 17)', () => {
  test('새로고침 뒤 이어 하기: 고친 내용과 수정 표시가 되살아나고, undo 기록은 되살리지 않는다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    // 커서를 옮겨 두 번에 나눠 입력한다. Monaco는 커서를 옮기면 undo 묶음을 끊으므로, 새로고침 전이라면
    // undo 한 번에 둘째 입력만 사라지고 첫째 입력은 남는다(2026-09-28 세 엔진에서 확인).
    await openFile(page, 'main.py');
    await typeAtEnd(page, '# one');
    await moveToFileStart(page);
    await page.keyboard.press('End');
    await page.keyboard.type(' # two');
    await expect.poll(() => storedText(page, 'main.py')).toBe('a = 1 # two\n# one');
    expect(await storedText(page, 'other.py')).toBeUndefined();

    await page.reload();
    await resume(page);
    await expect(treeItem(page, 'main.py')).toHaveAccessibleName(/수정됨/);
    await openFile(page, 'main.py');
    await expect(editor(page)).toContainText('# two');
    await expect(editor(page)).toContainText('# one');

    // 되살린 내용은 원본 위의 편집 하나다. undo 한 번에 두 입력이 함께 사라져 원본과 같아진다.
    // 다운로드 버튼은 원본과 똑같을 때만 꺼지므로 "정확히 원본"을 확인하는 데 쓴다.
    const mod = await primaryKey(page);
    await editorText(editor(page)).click();
    await page.keyboard.press(`${mod}+z`);
    await expect(editor(page)).not.toContainText('# one');
    await expect(editor(page)).not.toContainText('# two');
    await expect(editor(page)).toContainText('a = 1');
    await expect(treeItem(page, 'main.py')).not.toHaveAccessibleName(/수정됨/);
    await expect(downloadButton(page)).toBeDisabled();

    // 되살리기 전의 기록이 없으므로 한 번 더 눌러도 그대로다.
    await page.keyboard.press(`${mod}+z`);
    await expect(editor(page)).toContainText('a = 1');
    await expect(editor(page)).not.toContainText('# one');
    await expect(treeItem(page, 'main.py')).not.toHaveAccessibleName(/수정됨/);
    await expect(downloadButton(page)).toBeDisabled();
  });

  test('브라우저를 강제로 닫았다 다시 열어도 마지막 저장까지 되살아난다(Task 17)', async ({
    context,
  }) => {
    const first = await context.newPage();
    await first.goto('/');
    await uploadZip(first, 'project.zip', sample);
    await editAndWaitSaved(first, 'main.py', '# before crash');
    await first.close({ runBeforeUnload: false });
    const again = await context.newPage();
    await again.goto('/');
    await resume(again);
    await openFile(again, 'main.py');
    await expect(editor(again)).toContainText('# before crash');
  });

  test('모두 저장된 뒤에는 새로고침 경고가 뜨지 않는다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await editAndWaitSaved(page, 'main.py', '# saved');
    let asked = false;
    page.on('dialog', async (dialog) => {
      asked = dialog.type() === 'beforeunload';
      await dialog.accept();
    });
    await page.reload();
    expect(asked).toBe(false);
  });

  test('입력 직후 저장되기 전에 새로고침하면 이탈 경고가 뜬다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await openFile(page, 'main.py');
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    // 자동 저장은 입력이 1초 멈춘 뒤에 쓴다. 입력하고 곧바로 새로고침해 저장 전 상태를 만든다.
    await typeAtEnd(page, '# unsaved');
    await page.reload();
    expect(dialogs).toEqual(['beforeunload']);
  });

  test('버리기를 고르면 저장본이 지워지고 첫 화면이다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await editAndWaitSaved(page, 'main.py', '# gone');
    await page.reload();
    await page.getByRole('button', { name: text.discard }).click();
    await expect(page.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
    // 첫 화면 제목은 복원 안내 아래에도 보인다. 지우기가 커밋되기 전에 새로고침하면 트랜잭션이 취소된다.
    await expect.poll(() => storedZipName(page)).toBeUndefined();
    await page.reload();
    await expect(page.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('받은 뒤 새로고침하면 다운로드는 켜져 있고 받지 않은 변경은 없다. 한 파일을 더 고치면 1개다(ADR-0025)', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await editAndWaitSaved(page, 'main.py', '# downloaded');
    await Promise.all([page.waitForEvent('download'), downloadButton(page).click()]);
    await expect.poll(() => storedDownloadRecord(page)).not.toBeNull();
    await page.reload();
    await resume(page);
    await expect(downloadButton(page)).toBeEnabled();
    await expect(page.getByText(/받지 않은 변경/)).toHaveCount(0);
    await editAndWaitSaved(page, 'other.py', '# after');
    await expect(page.getByText(text.unexported(1))).toBeVisible();
    await page.reload();
    await resume(page);
    await expect(page.getByText(text.unexported(1))).toBeVisible();
  });
});
