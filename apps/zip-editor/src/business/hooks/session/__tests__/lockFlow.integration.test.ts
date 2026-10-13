// apps/zip-editor/src/business/hooks/session/__tests__/lockFlow.integration.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createFakeController,
  createFakeRepository,
  createFakeServices,
  createSharedBrowser,
  createTestFlows,
  deferred,
  zipFile,
} from '@/test/fakes';

afterEach(() => {
  vi.useRealTimers();
});

/** 한 브라우저의 두 탭. 잠금·채널·IndexedDB를 나눠 쓴다. */
function twoTabs(
  options: { waitA?: (ms: number) => Promise<void>; waitB?: (ms: number) => Promise<void> } = {},
) {
  const shared = createSharedBrowser(createFakeRepository());
  const booting = { lock: 'pending', phase: 'booting' } as const;
  const a = createTestFlows({
    services: createFakeServices(shared),
    state: booting,
    wait: options.waitA,
  });
  const b = createTestFlows({
    services: createFakeServices(shared),
    state: booting,
    wait: options.waitB,
  });
  return { shared, a, b };
}

const never = () => new Promise<void>(() => undefined);

describe('편집 잠금', () => {
  test('잠금을 얻은 탭만 저장본을 확인한다. 다른 탭은 busy이고 저장소를 읽지 않는다', async () => {
    const { shared, a, b } = twoTabs();
    await a.flows.start();
    expect(a.store.getState()).toMatchObject({ lock: 'holding', phase: 'empty' });
    const readsBefore = shared.repository.calls.readSummary;
    await b.flows.start();
    expect(b.store.getState()).toMatchObject({ lock: 'busy', phase: 'booting' });
    expect(shared.repository.calls.readSummary).toBe(readsBefore);
    expect(shared.lockManager.queued).toBe(1);
  });

  test('start를 두 번 불러도(StrictMode) 잠금 요청과 저장본 확인은 한 번이다', async () => {
    const { shared, a } = twoTabs();
    await Promise.all([a.flows.start(), a.flows.start()]);
    expect(a.store.getState().lock).toBe('holding');
    expect(shared.repository.calls.readSummary).toBe(1);
  });

  test('쥔 탭이 닫히면 granted로만 바뀌고, 편집 시작을 눌러야 holding이 된다', async () => {
    const { shared, a, b } = twoTabs();
    await a.flows.start();
    await b.flows.start();
    shared.lockManager.closeHolder();
    await expect.poll(() => b.store.getState().lock).toBe('granted');
    expect(b.store.getState().phase).toBe('booting');
    await b.flows.startEditing();
    expect(b.store.getState()).toMatchObject({ lock: 'holding', phase: 'empty' });
  });

  test('편집 시작을 누르기 전에 잠금을 빼앗기면 busy로 돌아가 다시 기다리고, 편집 시작은 듣지 않는다(ADR-0024)', async () => {
    const shared = createSharedBrowser(createFakeRepository());
    const tab = () =>
      createTestFlows({
        services: createFakeServices(shared),
        state: { lock: 'pending', phase: 'booting' },
        wait: () => Promise.resolve(),
      });
    const [a, b, c] = [tab(), tab(), tab()];
    await a.flows.start();
    await b.flows.start();
    await c.flows.start();
    shared.lockManager.closeHolder();
    await expect.poll(() => b.store.getState().lock).toBe('granted');
    // 잠금을 쥔 채 "편집 시작"을 기다리는 사이, 세 번째 탭이 가져간다.
    await c.flows.takeOver();
    expect(c.store.getState().lock).toBe('holding');
    await expect.poll(() => b.store.getState().lock).toBe('busy');
    await b.flows.startEditing();
    expect(b.store.getState()).toMatchObject({ lock: 'busy', phase: 'booting' });
    // 다시 차례를 기다린다. 가져간 탭이 닫히면 또 넘어온다.
    shared.lockManager.closeHolder();
    await expect.poll(() => b.store.getState().lock).toBe('granted');
  });

  test('여기서 열기: 잃은 탭은 진행 중 저장을 끝내고 신호를 보낸 뒤 읽기 전용, 가져온 탭은 신호를 받고 저장본을 읽는다', async () => {
    const { shared, a, b } = twoTabs({ waitB: never });
    await a.flows.start();
    await a.flows.openFiles([zipFile('project.zip')]);
    const controller = createFakeController({ contents: { 'main.py': '마지막 입력' } });
    a.flows.editorReady(1, controller);
    controller.emit.content('main.py');
    await b.flows.start();
    await b.flows.takeOver();
    expect(a.store.getState()).toMatchObject({ lock: 'lost', lostWithPending: true });
    expect(controller.readOnly).toBe(true);
    expect(b.store.getState()).toMatchObject({ lock: 'holding', phase: 'restorePrompt' });
    expect(shared.repository.files.has('main.py')).toBe(false);
  });

  test('"저장 끝남"이 오지 않아도 1초 뒤에는 저장본을 읽는다', async () => {
    vi.useFakeTimers();
    const { a, b } = twoTabs();
    await a.services.otherTab.editLock.tryAcquire();
    await b.flows.start();
    expect(b.store.getState().lock).toBe('busy');
    const taking = b.flows.takeOver();
    await vi.advanceTimersByTimeAsync(999);
    expect(b.store.getState().lock).toBe('busy');
    await vi.advanceTimersByTimeAsync(1);
    await taking;
    expect(b.store.getState()).toMatchObject({ lock: 'holding', phase: 'empty' });
  });

  test('잃은 탭은 그 뒤 저장소에 쓰지 않고, 저장 상태도 바꾸지 않는다', async () => {
    vi.useFakeTimers();
    const { shared, a, b } = twoTabs({ waitB: () => Promise.resolve() });
    await a.flows.start();
    await a.flows.openFiles([zipFile()]);
    const controller = createFakeController({ contents: { 'a.txt': '고침' } });
    a.flows.editorReady(1, controller);
    await b.flows.start();
    await b.flows.takeOver();
    const savesBefore = shared.repository.saves.length;
    controller.emit.content('a.txt');
    controller.emit.tree({ type: 'delete', path: 'a.txt' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(shared.repository.saves).toHaveLength(savesBefore);
    expect(a.store.getState().saveStatus).toBe('saved');
  });

  test('저장 전 입력이 없었으면 lostWithPending은 false다', async () => {
    const { a, b } = twoTabs({ waitB: () => Promise.resolve() });
    await a.flows.start();
    await b.flows.start();
    await b.flows.takeOver();
    expect(a.store.getState()).toMatchObject({ lock: 'lost', lostWithPending: false });
  });

  test('복원 안내가 떠 있을 때 잠금을 잃으면 안내를 닫는다', async () => {
    const shared = createSharedBrowser(createFakeRepository({ record: {} }));
    const booting = { lock: 'pending', phase: 'booting' } as const;
    const a = createTestFlows({ services: createFakeServices(shared), state: booting });
    const b = createTestFlows({
      services: createFakeServices(shared),
      state: booting,
      wait: () => Promise.resolve(),
    });
    await a.flows.start();
    expect(a.dialogs.restorePrompt).not.toBeNull();
    await b.flows.start();
    await b.flows.takeOver();
    expect(a.dialogs.restorePrompt).toBeNull();
    expect(a.store.getState().lock).toBe('lost');
    await a.flows.resume();
    expect(shared.repository.calls.load).toBe(0);
  });

  test('여기서 열기를 두 번 눌러도 한 번만 가져온다', async () => {
    const { shared, a, b } = twoTabs({ waitB: () => Promise.resolve() });
    await a.flows.start();
    await b.flows.start();
    await Promise.all([b.flows.takeOver(), b.flows.takeOver()]);
    expect(b.store.getState().lock).toBe('holding');
    expect(shared.repository.calls.readSummary).toBe(2);
  });

  test('잠금을 잃으면 진행 중 저장을 기다리기 전에 곧바로 읽기 전용이 된다', async () => {
    const { shared, a, b } = twoTabs({ waitB: never });
    await a.flows.start();
    await a.flows.openFiles([zipFile()]);
    const controller = createFakeController({ contents: { 'a.txt': '고침' } });
    a.flows.editorReady(1, controller);
    const gate = deferred();
    shared.repository.gate = gate.promise;
    controller.emit.content('a.txt');
    a.flows.flushNow();
    await b.flows.start();
    const taking = b.flows.takeOver();
    await expect.poll(() => a.store.getState().lock).toBe('lost');
    expect(controller.readOnly).toBe(true);
    expect(b.store.getState().lock).toBe('busy');
    gate.resolve();
    await taking;
    expect(shared.repository.files.get('a.txt')).toBe('고침');
  });

  test('새 ZIP을 저장본에 쓰는 사이 잃으면, 그 쓰기가 끝난 뒤에 "저장 끝남"을 보내고 이 탭은 열지 않는다', async () => {
    const { shared, a, b } = twoTabs({ waitB: never });
    await a.flows.start();
    const gate = deferred();
    shared.repository.replaceGate = gate.promise;
    const opening = a.flows.openFiles([zipFile('new.zip')]);
    await expect.poll(() => shared.repository.calls.replace).toBe(1);
    await b.flows.start();
    const taking = b.flows.takeOver();
    await expect.poll(() => a.store.getState().lock).toBe('lost');
    await Promise.resolve();
    expect(b.store.getState().lock).toBe('busy');
    gate.resolve();
    await Promise.all([opening, taking]);
    expect(b.store.getState()).toMatchObject({ lock: 'holding', phase: 'restorePrompt' });
    expect(b.store.getState().saved?.zipName).toBe('new.zip');
    expect(a.store.getState()).toMatchObject({ phase: 'empty', workspace: null });
    expect(a.services.sources[0]?.disposed).toBe(true);
  });
});
