import { EDIT_LOCK_NAME, type LockRequester } from '../editLock';

interface PendingRequest {
  readonly callback: (lock: Lock | null) => unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

/** 한 브라우저의 Web Locks 관리자 흉내. 이름 하나짜리 배타 잠금만 다룬다. 여러 "탭"이 같은 관리자를 나눠 쓴다. */
export interface FakeLockManager extends LockRequester {
  /** 잠금을 쥔 탭이 닫힌 것처럼 푼다. 기다리던 요청이 이어서 잠금을 얻는다. */
  closeHolder(): void;
  readonly held: boolean;
  readonly queued: number;
}

export function createFakeLockManager(): FakeLockManager {
  let holder: PendingRequest | undefined;
  const queue: PendingRequest[] = [];
  const lock: Lock = { name: EDIT_LOCK_NAME, mode: 'exclusive' };
  const abortError = () => new DOMException('잠금 요청이 끝났습니다', 'AbortError');
  const release = (request: PendingRequest) => {
    if (holder !== request) return;
    holder = undefined;
    const next = queue.shift();
    if (next) grant(next);
  };
  const grant = (request: PendingRequest) => {
    holder = request;
    void Promise.resolve()
      .then(() => request.callback(lock))
      .then(
        (value) => {
          release(request);
          request.resolve(value);
        },
        (error: unknown) => {
          release(request);
          request.reject(error);
        },
      );
  };
  return {
    get held() {
      return holder !== undefined;
    },
    get queued() {
      return queue.length;
    },
    closeHolder: () => {
      if (holder) release(holder);
    },
    request: (_name, options, callback) =>
      new Promise<unknown>((resolve, reject) => {
        const request: PendingRequest = { callback, resolve, reject };
        if (options.steal) {
          const previous = holder;
          holder = undefined;
          previous?.reject(abortError());
          grant(request);
          return;
        }
        if (holder === undefined && queue.length === 0) {
          grant(request);
          return;
        }
        if (options.ifAvailable) {
          void Promise.resolve()
            .then(() => callback(null))
            .then(resolve, reject);
          return;
        }
        queue.push(request);
        options.signal?.addEventListener('abort', () => {
          const index = queue.indexOf(request);
          if (index < 0) return;
          queue.splice(index, 1);
          reject(abortError());
        });
      }),
  };
}
