import { expect, test } from '@playwright/test';
import { editor, openFile, storedText, text, typeAtEnd, uploadZip } from './helpers/app.ts';

// 탭 두 개는 한 브라우저 컨텍스트의 페이지 두 개다. Web Locks·IndexedDB·BroadcastChannel은 컨텍스트마다 따로다(ADR-0024).
test.describe('편집 잠금 (Task 19)', () => {
  test('두 번째 탭은 안내만 보이고, 여기서 열기로 가져오면 첫 탭은 읽기 전용이 되며 저장본은 한 탭의 것만 남는다', async ({
    context,
  }) => {
    const first = await context.newPage();
    await first.goto('/');
    await uploadZip(first, 'project.zip', { 'main.py': 'a = 1\n' });
    await openFile(first, 'main.py');
    await typeAtEnd(first, '# from first');
    await expect.poll(() => storedText(first, 'main.py')).toContain('# from first');

    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(text.lockBusy)).toBeVisible();
    await expect(second.getByRole('heading', { name: text.emptyTitle })).toHaveCount(0);
    await second.getByRole('button', { name: text.takeOver }).click();

    await expect(first.getByText(text.readOnly)).toBeVisible();
    await expect(second.getByRole('dialog', { name: text.restoreTitle })).toBeVisible();
    await second.getByRole('button', { name: text.resume }).click();
    await openFile(second, 'main.py');
    await expect(editor(second)).toContainText('# from first');

    await editor(first).locator('.view-lines').click();
    await first.keyboard.type('zzz');
    await expect(editor(first)).not.toContainText('zzz');

    await typeAtEnd(second, '# from second');
    await expect.poll(() => storedText(second, 'main.py')).toContain('# from second');
    expect(await storedText(second, 'main.py')).not.toContain('zzz');
  });

  test('잠금을 쥔 탭을 닫으면 기다리던 탭이 편집 시작 안내로 바뀌고, 눌러야 편집한다', async ({
    context,
  }) => {
    const first = await context.newPage();
    await first.goto('/');
    await expect(first.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByText(text.lockBusy)).toBeVisible();
    await first.close();
    await expect(second.getByText(text.lockGranted)).toBeVisible();
    await expect(second.getByRole('heading', { name: text.emptyTitle })).toHaveCount(0);
    await second.getByRole('button', { name: text.startEditing }).click();
    await expect(second.getByRole('heading', { name: text.emptyTitle })).toBeVisible();
  });
});
