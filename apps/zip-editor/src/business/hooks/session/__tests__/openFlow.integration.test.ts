// apps/zip-editor/src/business/hooks/session/__tests__/openFlow.integration.test.ts
import { NotZipError } from '@codefold/zip-archive';
import { describe, expect, test, vi } from 'vitest';
import { createFakeController, createTestFlows, deferred, zipFile } from '@/test/fakes';
import { messages } from '@/utils/messages';
import { canUpload, LARGE_ZIP_BYTES } from '../sessionBusiness';

describe('업로드와 교체', () => {
  test('ZIP 하나를 열면 Worker로 목록을 읽고, 저장본을 바꾸고, ready가 된다', async () => {
    const { flows, store, services, preloadEditor } = createTestFlows();
    const file = zipFile();
    await flows.openFiles([file]);
    expect(services.openZipCalls).toEqual([file]);
    expect(services.repository.record).toMatchObject({ zipName: 'project.zip', zipBlob: file });
    expect(services.persistCalls).toBe(1);
    expect(preloadEditor).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      saveStatus: 'saved',
      workspace: { id: 1, zipName: 'project.zip', source: services.sources[0] },
    });
  });

  test('여는 동안 opening이고 업로드가 막혀, 그사이 놓은 ZIP은 무시한다', async () => {
    const { flows, store, services } = createTestFlows();
    const gate = deferred();
    services.openZipGate = gate.promise;
    const first = flows.openFiles([zipFile('first.zip')]);
    await Promise.resolve();
    expect(store.getState().phase).toBe('opening');
    expect(canUpload(store.getState())).toBe(false);
    await flows.openFiles([zipFile('second.zip')]);
    gate.resolve();
    await first;
    expect(services.openZipCalls).toHaveLength(1);
    expect(store.getState().workspace?.zipName).toBe('first.zip');
  });

  test('파일 두 개를 놓으면 아무것도 열지 않고 안내한다', async () => {
    const { flows, store, services } = createTestFlows();
    await flows.openFiles([zipFile('a.zip'), zipFile('b.zip')]);
    expect(services.openZipCalls).toEqual([]);
    expect(store.getState().uploadNotice).toBe('multiple');
  });

  test('ZIP이 아니면 이유를 남기고 열린 작업 공간은 그대로다', async () => {
    const { flows, store, services } = createTestFlows();
    await flows.openFiles([zipFile()]);
    const before = store.getState().workspace;
    services.openZipError = new NotZipError();
    await flows.openFiles([zipFile('photo.zip')]);
    expect(store.getState()).toMatchObject({
      phase: 'ready',
      uploadNotice: 'notZip',
      workspace: before,
    });
    expect(services.sources[0]?.disposed).toBe(false);
  });

  test('다음 업로드를 시작하면 앞의 안내를 지운다', async () => {
    const { flows, store, services } = createTestFlows();
    services.openZipError = new NotZipError();
    await flows.openFiles([zipFile()]);
    services.openZipError = null;
    const opening = flows.openFiles([zipFile()]);
    expect(store.getState().uploadNotice).toBeNull();
    await opening;
  });

  test('받지 않은 변경이 있으면 확인창을 띄우고, 취소하면 아무것도 바꾸지 않는다', async () => {
    const { flows, store, services, dialogs } = createTestFlows();
    await flows.openFiles([zipFile()]);
    store.setState({ unexported: { has: true, count: 2 } });
    dialogs.answers.push(false);
    await flows.openFiles([zipFile('next.zip')]);
    expect(dialogs.confirms).toEqual([
      expect.objectContaining({
        title: messages.replace.title,
        description: messages.replace.description,
      }),
    ]);
    expect(services.openZipCalls).toHaveLength(1);
    expect(store.getState().workspace?.id).toBe(1);
  });

  test('확인하면 새 작업 공간으로 바꾸고 옛 Worker를 끝낸다', async () => {
    const { flows, store, services, dialogs } = createTestFlows();
    await flows.openFiles([zipFile()]);
    store.setState({ unexported: { has: true, count: 2 } });
    dialogs.answers.push(true);
    await flows.openFiles([zipFile('next.zip')]);
    expect(store.getState()).toMatchObject({
      workspace: { id: 2, zipName: 'next.zip' },
      unexported: { has: false, count: 0 },
      hasChanges: false,
    });
    expect(services.sources[0]?.disposed).toBe(true);
    expect(services.repository.record?.zipName).toBe('next.zip');
    expect(services.persistCalls).toBe(1);
  });

  test('받지 않은 변경이 없으면 묻지 않고 바꾼다', async () => {
    const { flows, store, dialogs } = createTestFlows();
    await flows.openFiles([zipFile()]);
    await flows.openFiles([zipFile('next.zip')]);
    expect(dialogs.confirms).toEqual([]);
    expect(store.getState().workspace?.zipName).toBe('next.zip');
  });

  test('1GB를 넘으면 경고를 켜고 그대로 연다', async () => {
    const { flows, store } = createTestFlows();
    await flows.openFiles([zipFile('big.zip', LARGE_ZIP_BYTES + 1)]);
    expect(store.getState()).toMatchObject({ largeZip: true, phase: 'ready' });
  });

  test('저장소를 열 수 없으면 unavailable로 두고 그대로 연다', async () => {
    const { flows, store, services } = createTestFlows();
    services.repositoryAvailable = false;
    await flows.openFiles([zipFile()]);
    expect(store.getState()).toMatchObject({ phase: 'ready', saveStatus: 'unavailable' });
  });

  test('저장본 교체가 실패하면 failed로 두고 그대로 연다', async () => {
    const { flows, store, services } = createTestFlows();
    services.repository.failNext = new DOMException('용량 초과', 'QuotaExceededError');
    await flows.openFiles([zipFile()]);
    expect(store.getState()).toMatchObject({ phase: 'ready', saveStatus: 'failed' });
  });

  test('새 ZIP 저장이 실패하면 옛 저장본에 새 ZIP의 편집을 섞지 않고, 저장됨으로 바꾸지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const { flows, store, services } = createTestFlows();
      await flows.openFiles([zipFile('old.zip')]);
      flows.editorReady(1, createFakeController());
      const oldRecord = services.repository.record;
      services.repository.failNext = new DOMException('용량 초과', 'QuotaExceededError');
      await flows.openFiles([zipFile('new.zip')]);
      expect(store.getState()).toMatchObject({ phase: 'ready', saveStatus: 'failed' });
      const controller = createFakeController({ contents: { 'main.py': '새 ZIP 편집' } });
      flows.editorReady(2, controller);
      controller.emit.content('main.py');
      controller.emit.tree({ type: 'add', path: 'new.py', isDirectory: false });
      await vi.advanceTimersByTimeAsync(3000);
      flows.flushNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(services.repository.saves).toEqual([]);
      expect(services.repository.files.has('main.py')).toBe(false);
      // 옛 저장본은 지웠거나(가능하면), 적어도 새 편집이 섞이지 않은 그대로다.
      expect([null, oldRecord]).toContain(services.repository.record);
      expect(store.getState().saveStatus).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  test('잠금을 쥐지 않은 탭은 열지 않는다', async () => {
    const { flows, services } = createTestFlows({ state: { lock: 'busy' } });
    await flows.openFiles([zipFile()]);
    expect(services.openZipCalls).toEqual([]);
  });
});
