// apps/zip-editor/src/business/hooks/session/__tests__/editorFlow.integration.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createFakeController, createTestFlows, zipFile } from '@/test/fakes';
import { PERF_MARKS } from '../sessionBusiness';

afterEach(() => {
  vi.useRealTimers();
  performance.clearMarks();
  performance.clearMeasures();
});

async function openedFlows() {
  const harness = createTestFlows();
  await harness.flows.openFiles([zipFile()]);
  return harness;
}

describe('에디터 연결', () => {
  test('onReady에서 처음 상태를 옮기고, 구독으로 다운로드 버튼과 받지 않은 변경을 따라간다', async () => {
    const { flows, store } = await openedFlows();
    const controller = createFakeController({ hasChanges: true, unexportedCount: 2 });
    flows.editorReady(1, controller);
    expect(store.getState()).toMatchObject({
      controller,
      hasChanges: true,
      unexported: { has: true, count: 2 },
    });
    controller.emit.changes(false);
    expect(store.getState().hasChanges).toBe(false);
    controller.emit.unexported({ has: true, count: 3 });
    expect(store.getState().unexported).toEqual({ has: true, count: 3 });
  });

  test('다른 작업 공간 번호의 onReady는 무시한다', async () => {
    const { flows, store } = await openedFlows();
    flows.editorReady(99, createFakeController());
    expect(store.getState().controller).toBeNull();
  });

  test('onReady가 자동 저장을 붙인다: 입력이 멈추고 1초 뒤 고친 파일을 저장한다', async () => {
    const { flows, services } = await openedFlows();
    vi.useFakeTimers();
    const controller = createFakeController({ contents: { 'main.py': 'print(1)' } });
    flows.editorReady(1, controller);
    controller.emit.content('main.py');
    await vi.advanceTimersByTimeAsync(1100);
    expect(services.repository.files.get('main.py')).toBe('print(1)');
  });

  test('undo로 원본과 같아지면(onDirtyChange false) 저장본에서 지운다', async () => {
    const { flows, services } = await openedFlows();
    vi.useFakeTimers();
    services.repository.files.set('main.py', '옛 고침');
    const controller = createFakeController();
    flows.editorReady(1, controller);
    controller.emit.dirty('main.py', false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(services.repository.files.has('main.py')).toBe(false);
  });

  test('새 ZIP으로 바꾸면 옛 제어 API 구독을 모두 푼다', async () => {
    const { flows } = await openedFlows();
    const controller = createFakeController();
    flows.editorReady(1, controller);
    expect(controller.listenerCount()).toBe(6);
    await flows.openFiles([zipFile('next.zip')]);
    expect(controller.listenerCount()).toBe(0);
  });

  test('ZIP 열기부터 트리 준비까지 시간을 performance.measure로 남긴다', async () => {
    const { flows } = await openedFlows();
    flows.editorReady(1, createFakeController());
    expect(performance.getEntriesByName(PERF_MARKS.ready, 'measure')).toHaveLength(1);
  });

  test('새 ZIP의 에디터를 만들지 못하면 첫 화면으로 돌아가 안내하고 Worker를 끝낸다', async () => {
    const { flows, store, services } = await openedFlows();
    flows.editorFailed(1, new Error('Monaco 청크를 받지 못함'));
    expect(store.getState()).toMatchObject({
      phase: 'empty',
      workspace: null,
      uploadNotice: 'unknown',
    });
    expect(services.sources[0]?.disposed).toBe(true);
  });

  test('flushNow는 기다리지 않고 저장한다', async () => {
    const { flows, services } = await openedFlows();
    const controller = createFakeController({ contents: { 'a.txt': '고침' } });
    flows.editorReady(1, controller);
    controller.emit.content('a.txt');
    flows.flushNow();
    await vi.waitFor(() => expect(services.repository.files.get('a.txt')).toBe('고침'));
  });
});
