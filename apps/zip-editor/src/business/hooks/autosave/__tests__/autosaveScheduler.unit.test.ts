// apps/zip-editor/src/business/hooks/autosave/__tests__/autosaveScheduler.unit.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeController, createFakeRepository, deferred } from '@/test/fakes';
import {
  AUTOSAVE_QUIET_MS,
  createAutosaveScheduler,
  type AutosaveDeps,
} from '../autosaveScheduler';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(overrides: Partial<AutosaveDeps> = {}) {
  const controller = createFakeController({ contents: { 'a.txt': 'A1', 'b.txt': 'B1' } });
  const repository = createFakeRepository({ record: {} });
  const statuses: string[] = [];
  const scheduler = createAutosaveScheduler({
    controller,
    repository,
    scheduleIdle: (task) => {
      const handle = setTimeout(task, 0);
      return () => clearTimeout(handle);
    },
    workspaceId: 'ws-1',
    initialTreeChanges: [],
    savedPaths: [],
    onStatus: (status) => statuses.push(status),
    ...overrides,
  });
  return { controller, repository, statuses, scheduler };
}

describe('자동 저장 스케줄러', () => {
  test('입력하는 동안에는 저장하지 않고, 멈추고 약 1초 뒤 바뀐 파일만 저장한다', async () => {
    const { scheduler, repository, statuses } = setup();
    scheduler.contentChanged('a.txt');
    await vi.advanceTimersByTimeAsync(600);
    scheduler.contentChanged('a.txt');
    await vi.advanceTimersByTimeAsync(900);
    expect(repository.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(repository.saves).toHaveLength(1);
    expect(repository.saves[0]?.files).toEqual({ put: { 'a.txt': 'A1' }, remove: [] });
    expect(statuses).toEqual(['pending', 'saved']);
  });

  test('연속 입력 중에는 타이머를 새로 만들지 않는다(입력 반응을 늦추지 않음)', () => {
    const { scheduler } = setup();
    scheduler.contentChanged('a.txt');
    const timers = vi.spyOn(globalThis, 'setTimeout');
    for (let i = 0; i < 100; i += 1) scheduler.contentChanged('a.txt');
    expect(timers).not.toHaveBeenCalled();
  });

  test('원본과 같아진 파일(고친 목록에 없음)은 저장본에서 지운다', async () => {
    const { scheduler, repository, controller } = setup();
    controller.contents.delete('a.txt');
    scheduler.contentChanged('a.txt');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_QUIET_MS + 1);
    expect(repository.saves[0]?.files).toEqual({ put: {}, remove: ['a.txt'] });
  });

  test('트리 변경은 기다리지 않고, 트리 목록과 옮겨진 저장본을 함께 쓴다', async () => {
    const { scheduler, repository, controller } = setup({
      savedPaths: ['old.txt'],
      initialTreeChanges: [{ type: 'add', path: 'x', isDirectory: true }],
    });
    controller.contents.clear();
    controller.contents.set('new.txt', '옮긴 내용');
    scheduler.treeChanged({ type: 'rename', from: 'old.txt', to: 'new.txt' });
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saves).toHaveLength(1);
    expect(repository.saves[0]).toMatchObject({
      treeChanges: [
        { type: 'add', path: 'x', isDirectory: true },
        { type: 'rename', from: 'old.txt', to: 'new.txt' },
      ],
      files: { put: { 'new.txt': '옮긴 내용' }, remove: ['old.txt'] },
    });
  });

  test('폴더를 지우면 그 안의 저장본을 지운다', async () => {
    const { scheduler, repository, controller } = setup({
      savedPaths: ['src/a.ts', 'src/b/c.ts', 'srcx.ts'],
    });
    controller.contents.clear();
    scheduler.treeChanged({ type: 'delete', path: 'src' });
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saves[0]?.files).toEqual({ put: {}, remove: ['src/a.ts', 'src/b/c.ts'] });
  });

  test('레이아웃과 받지 않은 변경 요약은 묶어서 쓰고, 저장 대기로 치지 않는다', async () => {
    const { scheduler, repository, statuses } = setup();
    scheduler.layoutChanged({ n: 1 });
    scheduler.layoutChanged({ n: 2 });
    scheduler.unexportedChanged({ has: true, count: 1 });
    expect(statuses).toEqual([]);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_QUIET_MS + 1);
    expect(repository.saves).toHaveLength(1);
    expect(repository.saves[0]).toMatchObject({
      layout: { n: 2 },
      unexported: { has: true, count: 1 },
    });
    expect(statuses).toEqual([]);
  });

  test('다운로드 기록은 바로 쓴다', async () => {
    const { scheduler, repository } = setup();
    scheduler.downloadRecorded({ files: { 'a.txt': 'ab' }, paths: ['a.txt'], exportedAt: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saves[0]?.downloadRecord).toEqual({
      files: { 'a.txt': 'ab' },
      paths: ['a.txt'],
      exportedAt: 5,
    });
  });

  test('flushNow는 1초를 기다리지 않고 바로 쓴다(탭 숨김)', async () => {
    const { scheduler, repository } = setup();
    scheduler.contentChanged('b.txt');
    await scheduler.flushNow();
    expect(repository.saves[0]?.files).toEqual({ put: { 'b.txt': 'B1' }, remove: [] });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_QUIET_MS * 2);
    expect(repository.saves).toHaveLength(1);
  });

  test('저장이 실패하면 failed를 알리고, 다음 저장 때 실패한 파일까지 다시 쓴다', async () => {
    const { scheduler, repository, statuses } = setup();
    repository.failNext = new DOMException('용량 초과', 'QuotaExceededError');
    scheduler.contentChanged('a.txt');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_QUIET_MS + 1);
    expect(statuses).toEqual(['pending', 'failed']);
    scheduler.contentChanged('b.txt');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_QUIET_MS + 1);
    expect(repository.saves.at(-1)?.files?.put).toEqual({ 'a.txt': 'A1', 'b.txt': 'B1' });
    expect(statuses).toEqual(['pending', 'failed', 'saved']);
  });

  test('stop은 새 저장을 막고, 저장하지 못한 편집이 있었는지 알린다', async () => {
    const { scheduler, repository } = setup();
    scheduler.contentChanged('a.txt');
    await expect(scheduler.stop()).resolves.toEqual({ hadPending: true });
    scheduler.contentChanged('b.txt');
    scheduler.treeChanged({ type: 'delete', path: 'b.txt' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_QUIET_MS * 3);
    expect(repository.saves).toHaveLength(0);
  });

  test('stop은 진행 중인 저장이 끝날 때까지 기다린다', async () => {
    const { scheduler, repository } = setup();
    const gate = deferred();
    repository.gate = gate.promise;
    scheduler.contentChanged('a.txt');
    void scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;
    const stopping = scheduler.stop().then((result) => {
      stopped = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    gate.resolve();
    await expect(stopping).resolves.toEqual({ hadPending: false });
    expect(repository.saves).toHaveLength(1);
  });

  test('stop 뒤에는 줄에서 아직 시작하지 않은 저장을 버리고, 버린 것이 있었다고 알린다', async () => {
    const { scheduler, repository } = setup();
    const gate = deferred();
    repository.gate = gate.promise;
    scheduler.contentChanged('a.txt');
    void scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.contentChanged('b.txt');
    void scheduler.flushNow();
    const stopping = scheduler.stop();
    gate.resolve();
    await expect(stopping).resolves.toEqual({ hadPending: true });
    expect(repository.saves.map((changes) => Object.keys(changes.files?.put ?? {}))).toEqual([
      ['a.txt'],
    ]);
  });

  test('내용을 읽는 사이 stop하면 저장소에 쓰지 않는다', async () => {
    const { scheduler, repository, controller } = setup();
    const reading = deferred();
    const getSnapshotFor = controller.getSnapshotFor.bind(controller);
    controller.getSnapshotFor = async (paths) => {
      await reading.promise;
      return getSnapshotFor(paths);
    };
    scheduler.contentChanged('a.txt');
    void scheduler.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    const stopping = scheduler.stop();
    reading.resolve();
    await expect(stopping).resolves.toEqual({ hadPending: true });
    expect(repository.saves).toHaveLength(0);
  });
});
