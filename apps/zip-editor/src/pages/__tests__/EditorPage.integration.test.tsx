// apps/zip-editor/src/pages/__tests__/EditorPage.integration.test.tsx
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { NARROW_QUERY } from '@/services/browser/media';
import { deferred, zipFile } from '@/test/fakes';
import { installMatchMedia } from '@/test/media';
import { renderApp } from '@/test/renderApp';
import { messages } from '@/utils/messages';

const header = () => screen.getByRole('banner');
const headerUpload = () => within(header()).getByLabelText(messages.upload);
const downloadButton = () => within(header()).getByRole('button', { name: messages.download });
const emptyTitle = () => screen.findByRole('heading', { name: messages.empty.title });

async function openZip(app: ReturnType<typeof renderApp>, name = 'project.zip') {
  await app.user.upload(headerUpload(), zipFile(name));
  return screen.findByTestId('editor-host');
}

describe('편집 화면 (Task 12, 13)', () => {
  test('첫 화면: 상단 막대와 놓기 안내·업로드 버튼만 있고 다운로드는 꺼져 있다', async () => {
    renderApp();
    expect(await emptyTitle()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: messages.appTitle })).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
    expect(screen.getAllByLabelText(messages.upload)).toHaveLength(2);
    expect(screen.queryByTestId('editor-host')).toBeNull();
    expect(screen.queryByText(/샘플/)).toBeNull();
  });

  test('에디터 청크는 ZIP 열기를 시작할 때 불러오고, 여는 동안 로딩이 보이며 버튼이 꺼진다', async () => {
    const app = renderApp();
    await emptyTitle();
    expect(app.loadEditor).not.toHaveBeenCalled();
    const gate = deferred();
    app.services.openZipGate = gate.promise;
    await app.user.upload(headerUpload(), zipFile());
    expect(app.loadEditor).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(messages.opening)).toBeInTheDocument();
    for (const input of screen.getAllByLabelText(messages.upload)) expect(input).toBeDisabled();
    expect(downloadButton()).toBeDisabled();
    gate.resolve();
    expect(await screen.findByTestId('editor-host')).toHaveTextContent('project.zip');
    expect(app.loadEditor).toHaveBeenCalledTimes(1);
  });

  test('고치면 다운로드가 켜지고, 되돌리면 꺼진다', async () => {
    const app = renderApp();
    await emptyTitle();
    await openZip(app);
    expect(downloadButton()).toBeDisabled();
    act(() => app.controllers[0]?.emit.changes(true));
    expect(downloadButton()).toBeEnabled();
    act(() => app.controllers[0]?.emit.changes(false));
    expect(downloadButton()).toBeDisabled();
  });

  test('받지 않은 변경 N개 배지가 따라간다', async () => {
    const app = renderApp();
    await emptyTitle();
    await openZip(app);
    act(() => app.controllers[0]?.emit.unexported({ has: true, count: 2 }));
    expect(within(header()).getByText(messages.unexported(2))).toBeInTheDocument();
    act(() => app.controllers[0]?.emit.unexported({ has: false, count: 0 }));
    expect(within(header()).queryByText(/받지 않은 변경/)).toBeNull();
  });

  test('받지 않은 변경이 있을 때 새 ZIP: 확인창에서 취소하면 그대로다', async () => {
    const app = renderApp();
    await emptyTitle();
    await openZip(app);
    act(() => app.controllers[0]?.emit.unexported({ has: true, count: 1 }));
    await app.user.upload(headerUpload(), zipFile('next.zip'));
    const dialog = await screen.findByRole('alertdialog', { name: messages.replace.title });
    expect(dialog).toHaveTextContent(messages.replace.description);
    await app.user.click(within(dialog).getByRole('button', { name: messages.replace.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByTestId('editor-host')).toHaveAttribute('data-workspace', '1');
    expect(app.services.openZipCalls).toHaveLength(1);
  });

  test('확인하면 새 ZIP으로 바뀐다', async () => {
    const app = renderApp();
    await emptyTitle();
    await openZip(app);
    act(() => app.controllers[0]?.emit.unexported({ has: true, count: 1 }));
    await app.user.upload(headerUpload(), zipFile('next.zip'));
    const dialog = await screen.findByRole('alertdialog');
    await app.user.click(within(dialog).getByRole('button', { name: messages.replace.confirm }));
    await waitFor(() =>
      expect(screen.getByTestId('editor-host')).toHaveAttribute('data-workspace', '2'),
    );
    expect(screen.getByTestId('editor-host')).toHaveTextContent('next.zip');
  });

  test('파일을 끌어 오면 놓기 영역이 보이고 놓으면 연다. 화면 안의 끌기는 무시한다', async () => {
    renderApp();
    await emptyTitle();
    fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.queryByText(messages.dropOverlay)).toBeNull();
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText(messages.dropOverlay)).toBeInTheDocument();
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [zipFile('dropped.zip')] } });
    expect(screen.queryByText(messages.dropOverlay)).toBeNull();
    expect(await screen.findByTestId('editor-host')).toHaveTextContent('dropped.zip');
  });

  test('파일 두 개를 놓으면 열지 않는다', async () => {
    const app = renderApp();
    await emptyTitle();
    fireEvent.drop(window, {
      dataTransfer: { types: ['Files'], files: [zipFile('a.zip'), zipFile('b.zip')] },
    });
    await waitFor(() => expect(app.store.getState().uploadNotice).toBe('multiple'));
    expect(app.services.openZipCalls).toEqual([]);
  });

  test('좁은 화면이면 트리 버튼이 보이고, 누르면 트리 패널이 열린다', async () => {
    installMatchMedia({ [NARROW_QUERY]: true });
    const app = renderApp();
    await emptyTitle();
    expect(within(header()).queryByRole('button', { name: messages.treeToggle })).toBeNull();
    const host = await openZip(app);
    expect(host).toHaveAttribute('data-narrow', 'true');
    expect(host).toHaveAttribute('data-tree-open', 'false');
    await app.user.click(within(header()).getByRole('button', { name: messages.treeToggle }));
    expect(screen.getByTestId('editor-host')).toHaveAttribute('data-tree-open', 'true');
  });
});
