import { expect, test } from '@playwright/test';
import {
  downloadButton,
  editor,
  openFile,
  primaryKey,
  text,
  treeItem,
  typeAtEnd,
  uploadInput,
  uploadZip,
} from './helpers/app.ts';

const sample = { 'main.py': 'print("hi")\n', 'other.py': 'x = 1\n', docs: null } as const;

test.describe('다운로드와 받지 않은 변경 (Task 14, 15)', () => {
  test('고친 내용이 반영된 ZIP을 원래 이름으로 받고, 다시 올리면 그대로 있다(ADR-0033)', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await openFile(page, 'main.py');
    await expect(downloadButton(page)).toBeDisabled();
    await typeAtEnd(page, 'print("edited")');
    await expect(downloadButton(page)).toBeEnabled();
    await expect(page.getByText(text.unexported(1))).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton(page).click(),
    ]);
    expect(download.suggestedFilename()).toBe('project.zip');
    const saved = testInfo.outputPath('project.zip');
    await download.saveAs(saved);
    await expect(page.getByText(text.unexported(1))).toHaveCount(0);
    await expect(downloadButton(page)).toBeEnabled();
    await uploadInput(page).setInputFiles(saved);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(treeItem(page, 'docs')).toBeVisible();
    await openFile(page, 'main.py');
    await expect(editor(page)).toContainText('print("edited")');
  });

  test('undo로 원본과 같아지면 다운로드가 다시 꺼지고 받지 않은 변경도 사라진다', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await openFile(page, 'main.py');
    await typeAtEnd(page, '#');
    await expect(downloadButton(page)).toBeEnabled();
    const mod = await primaryKey(page);
    await page.keyboard.press(`${mod}+z`);
    await expect(downloadButton(page)).toBeDisabled();
    await expect(page.getByText(/받지 않은 변경/)).toHaveCount(0);
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect(downloadButton(page)).toBeEnabled();
  });

  test('받은 뒤 다른 파일을 고치면 받지 않은 변경 1개가 다시 보인다', async ({ page }) => {
    await page.goto('/');
    await uploadZip(page, 'project.zip', sample);
    await openFile(page, 'main.py');
    await typeAtEnd(page, '#a');
    await Promise.all([page.waitForEvent('download'), downloadButton(page).click()]);
    await expect(page.getByText(/받지 않은 변경/)).toHaveCount(0);
    await openFile(page, 'other.py');
    await typeAtEnd(page, '#b');
    await expect(page.getByText(text.unexported(1))).toBeVisible();
  });
});
