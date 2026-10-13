import { describe, expect, test, vi } from 'vitest';
import { createEditLock } from '../editLock';
import { createFakeLockManager } from './fakeLockManager';

describe('편집 잠금 (ADR-0024)', () => {
  test('비어 있으면 곧바로 얻고, 다른 탭은 기다리지 않고 못 얻는다', async () => {
    const manager = createFakeLockManager();
    const a = createEditLock(() => manager);
    const b = createEditLock(() => manager);
    await expect(a.tryAcquire()).resolves.toBe(true);
    await expect(b.tryAcquire()).resolves.toBe(false);
    expect(manager.queued).toBe(0);
  });

  test('tryAcquire를 여러 번 불러도 요청은 하나다 (StrictMode)', async () => {
    const manager = createFakeLockManager();
    const request = vi.spyOn(manager, 'request');
    const a = createEditLock(() => manager);
    await expect(Promise.all([a.tryAcquire(), a.tryAcquire()])).resolves.toEqual([true, true]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('쥔 탭이 닫히면 기다리던 탭이 잠금을 얻는다', async () => {
    const manager = createFakeLockManager();
    const a = createEditLock(() => manager);
    const b = createEditLock(() => manager);
    await a.tryAcquire();
    const waiting = b.waitForRelease(new AbortController().signal);
    expect(manager.queued).toBe(1);
    manager.closeHolder();
    await expect(waiting).resolves.toBe(true);
    expect(manager.held).toBe(true);
  });

  test('기다리기를 취소하면 false이고 대기열에서 빠진다', async () => {
    const manager = createFakeLockManager();
    await createEditLock(() => manager).tryAcquire();
    const controller = new AbortController();
    const waiting = createEditLock(() => manager).waitForRelease(controller.signal);
    controller.abort();
    await expect(waiting).resolves.toBe(false);
    expect(manager.queued).toBe(0);
  });

  test('steal하면 쥐고 있던 탭에 onLost가 오고, 가져온 탭이 잠금을 쥔다', async () => {
    const manager = createFakeLockManager();
    const a = createEditLock(() => manager);
    const b = createEditLock(() => manager);
    await a.tryAcquire();
    const lost = vi.fn();
    a.onLost(lost);
    await b.steal();
    await vi.waitFor(() => expect(lost).toHaveBeenCalledTimes(1));
    expect(manager.held).toBe(true);
  });

  test('onLost 구독을 풀면 더 알리지 않는다', async () => {
    const manager = createFakeLockManager();
    const a = createEditLock(() => manager);
    await a.tryAcquire();
    const lost = vi.fn();
    a.onLost(lost).dispose();
    await createEditLock(() => manager).steal();
    await Promise.resolve();
    await Promise.resolve();
    expect(lost).not.toHaveBeenCalled();
  });
});
