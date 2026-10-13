// apps/zip-editor/src/business/hooks/session/restoreFlow.ts
import { reportError } from '@/utils/reportError';
import {
  ensureRepository,
  isHolding,
  setWorkspace,
  trackWrite,
  type FlowContext,
} from './flowContext';
import { PERF_MARKS, snapshotFromStored } from './sessionBusiness';

export interface RestoreFlows {
  /** 이어 하기, 복원 실패 화면의 다시 시도. */
  resume(): Promise<void>;
  /** 버리기. */
  discardSaved(): Promise<void>;
}

export interface RestoreInternals extends RestoreFlows {
  /** 잠금을 얻은 뒤 저장본을 확인한다(design.md 시퀀스 7). */
  boot(): Promise<void>;
}

const canRestore = (ctx: FlowContext) => {
  const { phase } = ctx.store.getState();
  return isHolding(ctx) && (phase === 'restorePrompt' || phase === 'restoreFailed');
};

/**
 * 복원.
 * - 2026-09: 저장본을 읽지 못하거나 원본 ZIP을 다시 열지 못하면 저장본을 그대로 두고 restoreFailed로 간다.
 *   "버리기"를 골랐을 때만 지운다.
 * - 2026-09 · ADR-0024: 복원하는 사이 잠금을 잃으면 연 Worker를 끝내고 멈춘다.
 */
export function createRestoreFlows(ctx: FlowContext): RestoreInternals {
  const { store, services, dialogs } = ctx;
  const flows: RestoreInternals = {
    boot: async () => {
      const repository = await ensureRepository(ctx);
      if (!repository) {
        store.setState({ phase: 'empty' });
        return;
      }
      try {
        const saved = await repository.readSummary();
        if (!saved) {
          store.setState({ phase: 'empty' });
          return;
        }
        if (!isHolding(ctx)) return;
        store.setState({ phase: 'restorePrompt', saved });
        dialogs.showRestorePrompt({
          saved,
          onResume: () => void flows.resume(),
          onDiscard: () => void flows.discardSaved(),
        });
      } catch (error) {
        reportError(error);
        store.setState({ phase: 'restoreFailed', restoreError: error });
      }
    },
    resume: async () => {
      if (!canRestore(ctx)) return;
      dialogs.hideRestorePrompt();
      store.setState({ phase: 'restoring', restoreError: null });
      performance.mark(PERF_MARKS.open);
      ctx.preloadEditor();
      try {
        const repository = await ensureRepository(ctx);
        const stored = await repository?.load();
        if (!stored) {
          store.setState({ phase: 'empty', saved: null });
          return;
        }
        const source = await services.openZip(stored.record.zipBlob);
        if (!isHolding(ctx)) {
          source.dispose();
          store.setState({ phase: 'empty' });
          return;
        }
        setWorkspace(
          ctx,
          {
            zipName: stored.record.zipName,
            storageId: stored.record.id,
            source,
            snapshot: snapshotFromStored(stored),
          },
          { phase: 'ready', saved: null, saveStatus: 'saved' },
        );
      } catch (error) {
        reportError(error);
        store.setState({ phase: 'restoreFailed', restoreError: error });
      }
    },
    discardSaved: async () => {
      if (!canRestore(ctx)) return;
      dialogs.hideRestorePrompt();
      const repository = await ensureRepository(ctx);
      try {
        if (repository) await trackWrite(ctx, repository.clear());
      } catch {
        store.setState({ saveStatus: 'failed' });
      }
      store.setState({ phase: 'empty', saved: null, restoreError: null });
    },
  };
  return flows;
}
