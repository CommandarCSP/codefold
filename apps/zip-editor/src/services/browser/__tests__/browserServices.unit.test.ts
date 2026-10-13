// apps/zip-editor/src/services/browser/__tests__/browserServices.unit.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { requestPersistence } from '../persistStorage';
import { REVOKE_DELAY_MS, saveFile } from '../saveFile';
import { createScheduleIdle } from '../scheduleIdle';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('한가할 때 실행', () => {
  test('requestIdleCallback이 있으면 그것으로 부르고, 취소도 그것으로 한다', () => {
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 });
      return 7;
    });
    const task = vi.fn();
    const cancel = createScheduleIdle({ requestIdleCallback, cancelIdleCallback })(task);
    expect(task).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  test('requestIdleCallback이 없으면(Safari) setTimeout으로 부른다', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    createScheduleIdle({})(task);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test('없을 때 취소하면 부르지 않는다', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    createScheduleIdle({})(task)();
    vi.advanceTimersByTime(10);
    expect(task).not.toHaveBeenCalled();
  });
});

describe('파일 내려받기', () => {
  test('원래 이름으로 링크를 눌러 내려받고, 조금 뒤 object URL을 해제한다', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: () => 'blob:zip-editor/1', revokeObjectURL: revoke });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    saveFile(new Blob(['zip']), 'project.zip');
    expect(clicked[0]?.download).toBe('project.zip');
    expect(clicked[0]?.href).toBe('blob:zip-editor/1');
    expect(document.querySelector('a')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoke).toHaveBeenCalledWith('blob:zip-editor/1');
  });
});

describe('저장소 보존 요청', () => {
  test('결과를 돌려주고, 없거나 실패하면 false다', async () => {
    await expect(requestPersistence({ persist: async () => true })).resolves.toBe(true);
    await expect(requestPersistence(undefined)).resolves.toBe(false);
    await expect(
      requestPersistence({
        persist: async () => {
          throw new Error('거절');
        },
      }),
    ).resolves.toBe(false);
  });
});
