// apps/zip-editor/src/services/browser/scheduleIdle.ts
/** 한가할 때 한 번 부르고, 취소 함수를 돌려준다. */
export type ScheduleIdle = (task: () => void) => () => void;

interface IdleScope {
  readonly requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  readonly cancelIdleCallback?: (handle: number) => void;
}

const IDLE_TIMEOUT_MS = 2000;

/** `requestIdleCallback`이 없는 Safari는 `setTimeout`으로 대신한다(ADR-0014). */
export function createScheduleIdle(scope: IdleScope = globalThis): ScheduleIdle {
  const { requestIdleCallback: request, cancelIdleCallback: cancel } = scope;
  if (request && cancel) {
    return (task) => {
      const handle = request.call(scope, () => task(), { timeout: IDLE_TIMEOUT_MS });
      return () => cancel.call(scope, handle);
    };
  }
  return (task) => {
    const handle = setTimeout(task, 0);
    return () => clearTimeout(handle);
  };
}
