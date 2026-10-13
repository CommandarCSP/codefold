// apps/zip-editor/src/business/hooks/session/__tests__/restoreFlow.integration.test.ts
import { CorruptZipError } from '@codefold/zip-archive';
import { describe, expect, test, vi } from 'vitest';
import {
  createFakeController,
  createFakeRepository,
  createFakeServices,
  createSharedBrowser,
  createTestFlows,
  zipFile,
} from '@/test/fakes';
import { messages } from '@/utils/messages';

function savedFlows(record: Parameters<typeof createFakeRepository>[0] = { record: {} }) {
  const services = createFakeServices(createSharedBrowser(createFakeRepository(record)));
  return createTestFlows({ services, state: { lock: 'pending', phase: 'booting' } });
}

describe('복원', () => {
  test('저장본이 없으면 첫 화면이다', async () => {
    const { flows, store } = createTestFlows({ state: { lock: 'pending', phase: 'booting' } });
    await flows.start();
    expect(store.getState()).toMatchObject({ lock: 'holding', phase: 'empty' });
  });

  test('저장본이 있으면 ZIP 이름·마지막 수정 시각과 함께 복원 안내를 띄운다', async () => {
    const { flows, store, dialogs } = savedFlows({
      record: { zipName: 'old.zip', updatedAt: 1234 },
    });
    await flows.start();
    expect(store.getState().phase).toBe('restorePrompt');
    expect(dialogs.restorePrompt?.saved).toEqual({
      zipName: 'old.zip',
      updatedAt: 1234,
      unexported: { has: false, count: 0 },
    });
  });

  test('이어 하기: 저장된 원본을 다시 열고 트리 변경·내용·레이아웃·기록을 스냅샷으로 넘긴다', async () => {
    const blob = new Blob(['PK 저장본']);
    const { flows, store, services, dialogs, preloadEditor } = savedFlows({
      record: {
        zipBlob: blob,
        treeChanges: [{ type: 'add', path: 'new.txt', isDirectory: false }],
        layout: { grid: 'saved' },
        downloadRecord: { files: { 'a.txt': 'ab' }, paths: ['a.txt'], exportedAt: 9 },
      },
      files: { 'a.txt': '고친 내용' },
    });
    await flows.start();
    dialogs.restorePrompt?.onResume();
    await expect.poll(() => store.getState().phase).toBe('ready');
    expect(services.openZipCalls).toEqual([blob]);
    expect(preloadEditor).toHaveBeenCalled();
    expect(dialogs.restorePrompt).toBeNull();
    expect(store.getState().workspace).toMatchObject({
      id: 1,
      zipName: 'project.zip',
      snapshot: {
        treeChanges: [{ type: 'add', path: 'new.txt', isDirectory: false }],
        contents: { 'a.txt': '고친 내용' },
        layout: { grid: 'saved' },
        downloadRecord: { files: { 'a.txt': 'ab' }, paths: ['a.txt'], exportedAt: 9 },
      },
    });
  });

  test('복원한 뒤 자동 저장은 저장본의 트리 변경에 이어 붙이고, 이미 저장된 경로를 안다', async () => {
    const { flows, store, services, dialogs } = savedFlows({
      record: { treeChanges: [{ type: 'add', path: 'a.txt', isDirectory: false }] },
      files: { 'a.txt': '고친 내용' },
    });
    await flows.start();
    dialogs.restorePrompt?.onResume();
    await expect.poll(() => store.getState().phase).toBe('ready');
    const controller = createFakeController();
    flows.editorReady(1, controller);
    controller.emit.tree({ type: 'delete', path: 'a.txt' });
    await expect
      .poll(() => services.repository.record?.treeChanges)
      .toEqual([
        { type: 'add', path: 'a.txt', isDirectory: false },
        { type: 'delete', path: 'a.txt' },
      ]);
    expect(services.repository.files.has('a.txt')).toBe(false);
  });

  test('버리기: 저장본을 지우고 첫 화면', async () => {
    const { flows, store, services, dialogs } = savedFlows();
    await flows.start();
    dialogs.restorePrompt?.onDiscard();
    await expect.poll(() => store.getState().phase).toBe('empty');
    expect(services.repository.record).toBeNull();
    expect(dialogs.restorePrompt).toBeNull();
  });

  test('저장본이 손상됐으면 restoreFailed이고 저장본은 지우지 않는다', async () => {
    const { flows, store, services } = savedFlows();
    services.repository.corrupt = true;
    await flows.start();
    expect(store.getState().phase).toBe('restoreFailed');
    expect(services.repository.record).not.toBeNull();
    expect(services.repository.calls.clear).toBe(0);
  });

  test('원본 ZIP을 다시 열 수 없으면 restoreFailed, 다시 시도하면 처음부터 다시 한다', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { flows, store, services, dialogs } = savedFlows();
    await flows.start();
    services.openZipError = new CorruptZipError('끝이 잘림');
    dialogs.restorePrompt?.onResume();
    await expect.poll(() => store.getState().phase).toBe('restoreFailed');
    expect(store.getState().restoreError).toBe(services.openZipError);
    // 화면은 복원 실패를 보이지만, 원인은 오류 보고로도 남긴다. 운영에서 복원이 실패하면 콘솔에서 찾을 수 있다.
    expect(report).toHaveBeenCalledWith(services.openZipError, '');
    services.openZipError = null;
    await flows.resume();
    expect(store.getState()).toMatchObject({ phase: 'ready', restoreError: null });
    expect(services.repository.calls.load).toBe(2);
    report.mockRestore();
  });

  test('복원 실패 화면의 버리기만 저장본을 지운다', async () => {
    const { flows, store, services } = savedFlows();
    services.repository.corrupt = true;
    await flows.start();
    await flows.discardSaved();
    expect(store.getState().phase).toBe('empty');
    expect(services.repository.calls.clear).toBe(1);
  });

  test('에디터가 스냅샷을 되살리지 못하면 restoreFailed, 다시 시도는 새 작업 공간 번호로 한다', async () => {
    const { flows, store, dialogs } = savedFlows();
    await flows.start();
    dialogs.restorePrompt?.onResume();
    await expect.poll(() => store.getState().phase).toBe('ready');
    flows.editorFailed(1, new Error('트리 변경을 다시 적용하지 못함'));
    expect(store.getState()).toMatchObject({ phase: 'restoreFailed', workspace: null });
    await flows.resume();
    expect(store.getState().workspace?.id).toBe(2);
  });

  test('복원 안내 중 새 ZIP: 저장본에 받지 않은 변경이 있으면 이전 ZIP 이름으로 확인한다', async () => {
    const { flows, store, dialogs, services } = savedFlows({
      record: { zipName: 'old.zip', unexported: { has: true, count: 2 } },
    });
    await flows.start();
    dialogs.answers.push(true);
    await flows.openFiles([zipFile('new.zip')]);
    expect(dialogs.confirms[0]?.description).toBe(messages.discardSaved('old.zip'));
    expect(dialogs.restorePrompt).toBeNull();
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      workspace: { zipName: 'new.zip' },
      saved: null,
    });
    expect(services.repository.record?.zipName).toBe('new.zip');
  });

  test('복원 안내 중 새 ZIP: 받지 않은 변경이 없으면 묻지 않고 연다', async () => {
    const { flows, store, dialogs } = savedFlows();
    await flows.start();
    await flows.openFiles([zipFile('new.zip')]);
    expect(dialogs.confirms).toEqual([]);
    expect(store.getState().workspace?.zipName).toBe('new.zip');
  });
});
