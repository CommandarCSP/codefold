// apps/zip-editor/src/components/domain/__tests__/SessionScreens.integration.test.tsx
import { CorruptZipError } from '@codefold/zip-archive';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  createFakeRepository,
  createFakeServices,
  createSharedBrowser,
  zipFile,
} from '@/test/fakes';
import { renderApp } from '@/test/renderApp';
import { messages } from '@/utils/messages';

const savedServices = (record = {}) =>
  createFakeServices(
    createSharedBrowser(createFakeRepository({ record: { zipName: 'old.zip', ...record } })),
  );

describe('복원 안내', () => {
  test('저장본이 있으면 ZIP 이름과 함께 뜨고, 포커스가 이어 하기에 있다(Task 18)', async () => {
    renderApp({ services: savedServices() });
    const dialog = await screen.findByRole('dialog', { name: messages.restore.title });
    expect(dialog).toHaveTextContent('old.zip');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: messages.restore.resume })).toHaveFocus(),
    );
  });

  test('이어 하기를 고르면 스냅샷을 가진 에디터가 붙는다', async () => {
    const app = renderApp({ services: savedServices() });
    const dialog = await screen.findByRole('dialog');
    await app.user.click(within(dialog).getByRole('button', { name: messages.restore.resume }));
    expect(await screen.findByTestId('editor-host')).toHaveTextContent('old.zip');
    expect(app.store.getState().workspace?.snapshot).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('버리기를 고르면 저장본을 지우고 첫 화면이다', async () => {
    const app = renderApp({ services: savedServices() });
    const dialog = await screen.findByRole('dialog');
    await app.user.click(within(dialog).getByRole('button', { name: messages.restore.discard }));
    expect(await screen.findByRole('heading', { name: messages.empty.title })).toBeInTheDocument();
    expect(app.services.repository.record).toBeNull();
  });

  test('복원 안내가 떠 있어도 상단 업로드 버튼으로 새 ZIP을 열 수 있다', async () => {
    const app = renderApp({ services: savedServices() });
    await screen.findByRole('dialog');
    await app.user.upload(
      within(screen.getByRole('banner')).getByLabelText(messages.upload),
      zipFile('new.zip'),
    );
    expect(await screen.findByTestId('editor-host')).toHaveTextContent('new.zip');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('복원에 실패하면 오류 알림과 다시 시도·버리기, 저장본은 그대로다', async () => {
    const app = renderApp({ services: savedServices() });
    app.services.openZipError = new CorruptZipError('끝이 잘림');
    const dialog = await screen.findByRole('dialog');
    await app.user.click(within(dialog).getByRole('button', { name: messages.restore.resume }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.restoreFailed.title);
    expect(app.services.repository.record).not.toBeNull();
    app.services.openZipError = null;
    await app.user.click(within(alert).getByRole('button', { name: messages.restoreFailed.retry }));
    expect(await screen.findByTestId('editor-host')).toHaveTextContent('old.zip');
  });
});

describe('편집 잠금 화면', () => {
  test('다른 탭이 쥐고 있으면 안내와 여기서 열기만 보이고, 업로드는 꺼져 있다', async () => {
    const services = createFakeServices();
    await services.otherTab.editLock.tryAcquire();
    renderApp({ services });
    expect(await screen.findByText(messages.lock.busy)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.lock.takeOver })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: messages.empty.title })).toBeNull();
    expect(within(screen.getByRole('banner')).getByLabelText(messages.upload)).toBeDisabled();
  });

  test('여기서 열기: 다른 탭의 "저장 끝남"을 받으면 첫 화면이 된다', async () => {
    const services = createFakeServices();
    await services.otherTab.editLock.tryAcquire();
    const app = renderApp({ services });
    await app.user.click(await screen.findByRole('button', { name: messages.lock.takeOver }));
    act(() => services.otherTab.lockChannel.announceSaveFinished());
    expect(await screen.findByRole('heading', { name: messages.empty.title })).toBeInTheDocument();
  });

  test('쥔 탭이 닫히면 편집 시작 안내로 바뀌고, 눌러야 첫 화면이 된다', async () => {
    const services = createFakeServices();
    await services.otherTab.editLock.tryAcquire();
    const app = renderApp({ services });
    await screen.findByText(messages.lock.busy);
    act(() => services.shared.lockManager.closeHolder());
    const start = await screen.findByRole('button', { name: messages.lock.start });
    expect(screen.getByText(messages.lock.granted)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: messages.empty.title })).toBeNull();
    await app.user.click(start);
    expect(await screen.findByRole('heading', { name: messages.empty.title })).toBeInTheDocument();
  });
});
