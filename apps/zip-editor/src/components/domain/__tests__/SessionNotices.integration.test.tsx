// apps/zip-editor/src/components/domain/__tests__/SessionNotices.integration.test.tsx
import { InvalidZipItemError, NotZipError } from '@codefold/zip-archive';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { LARGE_ZIP_BYTES } from '@/business/hooks/session/sessionBusiness';
import { createFakeController, createFakeServices, zipFile } from '@/test/fakes';
import { renderApp } from '@/test/renderApp';
import { messages } from '@/utils/messages';

const headerUpload = () => within(screen.getByRole('banner')).getByLabelText(messages.upload);
const ready = () => screen.findByRole('heading', { name: messages.empty.title });

describe('알림', () => {
  test('ZIP이 아니면 이유가 사라지지 않는 alert로 보이고, 다음 업로드를 시작하면 지워진다', async () => {
    const app = renderApp();
    await ready();
    app.services.openZipError = new NotZipError();
    await app.user.upload(headerUpload(), zipFile('photo.zip'));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.uploadNotice.notZip);
    app.services.openZipError = null;
    await app.user.upload(headerUpload(), zipFile());
    await waitFor(() => expect(screen.queryByText(messages.uploadNotice.notZip)).toBeNull());
  });

  test('업로드 오류는 떠 있는 알림으로 보이고, 닫기 버튼으로 닫는다', async () => {
    const app = renderApp();
    await ready();
    app.services.openZipError = new NotZipError();
    await app.user.upload(headerUpload(), zipFile('photo.zip'));
    const alert = await screen.findByRole('alert');
    // 알림이 생기고 사라질 때 에디터가 밀리지 않도록 레이아웃 흐름 밖(fixed)에 띄운다.
    expect(alert.closest('.fixed')).not.toBeNull();
    await app.user.click(within(alert).getByRole('button', { name: messages.dismissNotice }));
    expect(screen.queryByText(messages.uploadNotice.notZip)).toBeNull();
  });

  test('파일 두 개를 놓으면 하나만 놓아 달라는 안내가 보인다', async () => {
    renderApp();
    await ready();
    fireEvent.drop(window, {
      dataTransfer: { types: ['Files'], files: [zipFile('a.zip'), zipFile('b.zip')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.uploadNotice.multiple);
  });

  test('1GB를 넘는 ZIP은 경고와 함께 그대로 열린다', async () => {
    const app = renderApp();
    await ready();
    await app.user.upload(headerUpload(), zipFile('big.zip', LARGE_ZIP_BYTES + 1));
    expect(await screen.findByText(messages.largeZip)).toBeInTheDocument();
    expect(await screen.findByTestId('editor-host')).toHaveTextContent('big.zip');
  });

  test('큰 ZIP 경고를 닫아도, 다운로드가 실패하면 메모리 안내는 그대로 붙는다', async () => {
    const app = renderApp({ makeController: () => createFakeController({ hasChanges: true }) });
    await ready();
    await app.user.upload(headerUpload(), zipFile('big.zip', LARGE_ZIP_BYTES + 1));
    await screen.findByTestId('editor-host');
    const warning = (await screen.findByText(messages.largeZip)).closest('[role="status"]');
    await app.user.click(
      within(warning as HTMLElement).getByRole('button', { name: messages.dismissNotice }),
    );
    expect(screen.queryByText(messages.largeZip)).toBeNull();
    const source = app.services.sources[0];
    if (!source) throw new Error('ZIP이 열리지 않았다');
    source.result = new Error('쓰기 실패');
    await app.user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: messages.download }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.downloadFailed.outOfMemory);
    await app.user.click(within(alert).getByRole('button', { name: messages.dismissNotice }));
    expect(screen.queryByText(messages.downloadFailed.title)).toBeNull();
  });

  test('저장소를 열 수 없으면 저장 불가 배너가 보인다', async () => {
    const services = createFakeServices();
    services.repositoryAvailable = false;
    renderApp({ services });
    expect(await screen.findByText(messages.storageUnavailable)).toBeInTheDocument();
  });

  test('다운로드가 끝나면 라이브 영역이 알린다(Task 18)', async () => {
    const app = renderApp({ makeController: () => createFakeController({ hasChanges: true }) });
    await ready();
    await app.user.upload(headerUpload(), zipFile('project.zip'));
    await screen.findByTestId('editor-host');
    await app.user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: messages.download }),
    );
    expect(await screen.findByText(messages.downloadDone('project.zip'))).toBeInTheDocument();
  });

  test('ZIP 쓰기가 실패하면 alert와 다시 시도가 보이고, 누르면 다시 만든다', async () => {
    const app = renderApp({ makeController: () => createFakeController({ hasChanges: true }) });
    await ready();
    await app.user.upload(headerUpload(), zipFile());
    await screen.findByTestId('editor-host');
    const source = app.services.sources[0];
    if (!source) throw new Error('ZIP이 열리지 않았다');
    source.result = new Error('쓰기 실패');
    await app.user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: messages.download }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.downloadFailed.title);
    expect(alert).toHaveTextContent(messages.downloadFailed.reason.unknown);
    source.result = new Blob(['PK']);
    await app.user.click(
      within(alert).getByRole('button', { name: messages.downloadFailed.retry }),
    );
    await waitFor(() => expect(source.exported).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(messages.downloadFailed.title)).toBeNull());
  });

  test('쓸 수 없는 항목이면 그 경로를, 큰 ZIP이면 메모리 안내를 함께 보인다', async () => {
    const app = renderApp({ makeController: () => createFakeController({ hasChanges: true }) });
    await ready();
    await app.user.upload(headerUpload(), zipFile('big.zip', LARGE_ZIP_BYTES + 1));
    await screen.findByTestId('editor-host');
    const source = app.services.sources[0];
    if (!source) throw new Error('ZIP이 열리지 않았다');
    source.result = new InvalidZipItemError('bad/', '/로 끝나는 파일 경로');
    await app.user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: messages.download }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.downloadFailed.reason.invalidItem('bad/'));
    expect(alert).toHaveTextContent(messages.downloadFailed.outOfMemory);
  });

  test('잠금을 잃으면 읽기 전용 안내가 보이고, 저장 전 입력이 있었으면 그 사실도 보인다', async () => {
    const app = renderApp({
      makeController: () => createFakeController({ contents: { 'a.txt': '마지막 입력' } }),
    });
    await ready();
    await app.user.upload(headerUpload(), zipFile());
    await screen.findByTestId('editor-host');
    act(() => app.controllers[0]?.emit.content('a.txt'));
    await act(() => app.services.otherTab.editLock.steal());
    expect(await screen.findByText(messages.readOnly.title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(messages.readOnly.unsavedLost))).toBeInTheDocument();
    expect(app.controllers[0]?.readOnly).toBe(true);
    expect(headerUpload()).toBeDisabled();
  });
});
