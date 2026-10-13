import type { Disposable } from '@codefold/virtual-fs';

export const EDIT_LOCK_NAME = 'codefold-workspace';

/** `navigator.locks`에서 이 앱이 쓰는 모양. 테스트는 가짜 관리자를 넘긴다. */
export interface LockRequester {
  request(
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => unknown,
  ): Promise<unknown>;
}

/** 편집 권한을 브라우저 탭 하나에만 준다(ADR-0024). */
export interface EditLock {
  /** 곧바로 판정한다(`ifAvailable`). 여러 번 불러도 첫 요청 하나만 건다(StrictMode). */
  tryAcquire(): Promise<boolean>;
  /** 쥔 탭이 닫혀 잠금이 넘어오면 `true`, `signal`로 취소하면 `false`. */
  waitForRelease(signal: AbortSignal): Promise<boolean>;
  /** 다른 탭에서 잠금을 가져온다(`steal`). */
  steal(): Promise<void>;
  /** 쥐고 있던 잠금을 다른 탭이 가져갔을 때. */
  onLost(listener: () => void): Disposable;
}

export function createEditLock(locks: () => LockRequester = () => navigator.locks): EditLock {
  const listeners = new Set<() => void>();
  let first: Promise<boolean> | undefined;
  const hold = (options: LockOptions) =>
    new Promise<boolean>((resolve) => {
      let granted = false;
      locks()
        .request(EDIT_LOCK_NAME, options, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          granted = true;
          resolve(true);
          // 탭이 살아 있는 동안 쥔다. 풀리는 때는 탭이 닫히거나 다른 탭이 가져갈 때뿐이다.
          return new Promise<never>(() => undefined);
        })
        .catch(() => {
          // 쥐고 있다가 빼앗기면, 또는 기다리다 취소되면 AbortError로 끝난다.
          if (!granted) {
            resolve(false);
            return;
          }
          for (const listener of [...listeners]) listener();
        });
    });
  return {
    tryAcquire: () => (first ??= hold({ ifAvailable: true })),
    waitForRelease: (signal) => hold({ signal }),
    steal: async () => {
      await hold({ steal: true });
    },
    onLost: (listener) => {
      listeners.add(listener);
      return { dispose: () => void listeners.delete(listener) };
    },
  };
}
