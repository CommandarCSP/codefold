// apps/zip-editor/src/business/hooks/session/lockFlow.ts
import { stopAutosave, type FlowContext } from './flowContext';
import { TAKEOVER_WAIT_MS } from './sessionBusiness';

export interface LockFlows {
  /** 앱의 첫 동작. 잠금을 곧바로 판정하고, 얻으면 저장본을 확인한다. */
  start(): Promise<void>;
  /** "여기서 열기". */
  takeOver(): Promise<void>;
  /** "편집 시작". */
  startEditing(): Promise<void>;
}

/**
 * 편집 잠금(design.md 시퀀스 8, ADR-0024).
 * - 2026-09: 못 얻으면 저장본을 읽지 않고, 뒤에서 기다리는 요청을 하나 걸어 둔다.
 * - 2026-09: 기다리던 요청이 얻어도 사용자가 "편집 시작"을 누르기 전에는 편집 상태로 바꾸지 않는다.
 * - 2026-09: 가져오기 전에 기다리던 요청을 취소하고, "저장 끝남"을 먼저 듣기 시작한 뒤 steal한다.
 * - 2026-09: 잃으면 곧바로 lost·읽기 전용으로 바꿔 새 저장과 입력을 막는다. 진행 중 저장(자동 저장, 새 ZIP 교체,
 *   버리기)이 끝나면 "저장 끝남"을 보낸다. 줄에서 기다리던 자동 저장은 버린다.
 */
export function createLockFlows(ctx: FlowContext, boot: () => Promise<void>): LockFlows {
  const { store, services, dialogs, runtime } = ctx;

  const waitForHandOver = () => {
    const controller = new AbortController();
    runtime.handOver = controller;
    void services.editLock.waitForRelease(controller.signal).then((granted) => {
      if (granted && store.getState().lock === 'busy') store.setState({ lock: 'granted' });
    });
  };

  const handleLost = async () => {
    // 잠금이 넘어와 "편집 시작"을 기다리는 사이(granted)에도 잠금은 이 탭이 쥐고 있다. 그때 빼앗기면
    // 아직 연 작업이 없으니 저장할 것도 없다. 다시 busy로 돌아가 다음 차례를 기다린다(ADR-0024).
    if (store.getState().lock === 'granted') {
      store.setState({ lock: 'busy' });
      waitForHandOver();
      return;
    }
    if (store.getState().lock !== 'holding') return;
    store.setState({ lock: 'lost' });
    // 기다리기 전에 곧바로 막는다. 저장이 끝나기를 기다리는 사이의 입력은 어디에도 저장되지 않는다.
    store.getState().controller?.setReadOnly(true);
    dialogs.hideRestorePrompt();
    const [{ hadPending }] = await Promise.all([stopAutosave(ctx), runtime.pendingWrite]);
    services.lockChannel.announceSaveFinished();
    store.setState({ lostWithPending: hadPending });
  };

  return {
    start: async () => {
      if (store.getState().lock !== 'pending') return;
      runtime.lostSubscription ??= services.editLock.onLost(() => void handleLost());
      const acquired = await services.editLock.tryAcquire();
      if (store.getState().lock !== 'pending') return;
      if (!acquired) {
        store.setState({ lock: 'busy' });
        waitForHandOver();
        return;
      }
      store.setState({ lock: 'holding' });
      await boot();
    },
    takeOver: async () => {
      if (store.getState().lock !== 'busy' || runtime.takingOver) return;
      runtime.takingOver = true;
      try {
        runtime.handOver?.abort();
        runtime.handOver = undefined;
        const finished = services.lockChannel.nextSaveFinished();
        await services.editLock.steal();
        await Promise.race([finished.promise, ctx.wait(TAKEOVER_WAIT_MS)]);
        finished.cancel();
        store.setState({ lock: 'holding' });
        await boot();
      } finally {
        runtime.takingOver = false;
      }
    },
    startEditing: async () => {
      if (store.getState().lock !== 'granted') return;
      runtime.handOver = undefined;
      store.setState({ lock: 'holding' });
      await boot();
    },
  };
}
