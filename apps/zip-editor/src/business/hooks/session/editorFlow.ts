// apps/zip-editor/src/business/hooks/session/editorFlow.ts
import { reportError } from '@/utils/reportError';
import type { CodeEditorController } from '@codefold/react-code-editor';
import type { Disposable } from '@codefold/virtual-fs';
import { createAutosaveScheduler } from '../autosave/autosaveScheduler';
import { isHolding, setWorkspace, stopAutosave, type FlowContext } from './flowContext';
import { PERF_MARKS } from './sessionBusiness';

export interface EditorFlows {
  /** `<CodeEditor onReady>`. 작업 공간마다 한 번 온다. */
  editorReady(workspaceId: number, controller: CodeEditorController): void;
  /** `<CodeEditor onError>`. 작업 공간을 만들지 못했다. */
  editorFailed(workspaceId: number, error: unknown): void;
  /** 탭이 숨겨질 때. */
  flushNow(): void;
}

function measureReady() {
  if (performance.getEntriesByName(PERF_MARKS.open, 'mark').length === 0) return;
  performance.measure(PERF_MARKS.ready, PERF_MARKS.open);
  performance.clearMarks(PERF_MARKS.open);
}

/**
 * 제어 API 이벤트를 스토어와 자동 저장으로 잇는다(design.md "상태 위치").
 * - 2026-09: onContentChange는 자동 저장의 Set에만 넣고 스토어를 바꾸지 않는다.
 * - 2026-09 · ADR-0024: 잠금을 쥔 탭만 자동 저장을 붙인다.
 */
export function createEditorFlows(ctx: FlowContext): EditorFlows {
  const { store } = ctx;
  const current = (id: number) => {
    const { workspace } = store.getState();
    return workspace && workspace.id === id ? workspace : undefined;
  };

  return {
    editorReady: (id, controller) => {
      const workspace = current(id);
      if (!workspace) return;
      for (const subscription of ctx.runtime.editorSubscriptions) subscription.dispose();
      void ctx.runtime.autosave?.stop();
      ctx.runtime.autosave = undefined;
      measureReady();
      const count = controller.getUnexportedCount();
      const unexported = { has: count > 0, count };
      store.setState({ controller, hasChanges: controller.hasChanges(), unexported });
      if (store.getState().lock === 'lost') controller.setReadOnly(true);
      const subscriptions: Disposable[] = [
        controller.onChangesChange((hasChanges) => store.setState({ hasChanges })),
        controller.onUnexportedChange((next) => {
          store.setState({ unexported: next });
          ctx.runtime.autosave?.unexportedChanged(next);
        }),
      ];
      const repository = ctx.runtime.repository;
      // 저장본에 두지 못한 작업 공간(storageId 없음)은 자동 저장을 붙이지 않는다. 옛 저장본에 섞이면 안 된다.
      if (repository && workspace.storageId !== undefined && isHolding(ctx)) {
        const autosave = createAutosaveScheduler({
          controller,
          repository,
          workspaceId: workspace.storageId,
          scheduleIdle: ctx.services.scheduleIdle,
          initialTreeChanges: workspace.snapshot?.treeChanges ?? [],
          savedPaths: Object.keys(workspace.snapshot?.contents ?? {}),
          onStatus: (saveStatus) => {
            if (isHolding(ctx)) store.setState({ saveStatus });
          },
          now: ctx.now,
        });
        ctx.runtime.autosave = autosave;
        autosave.unexportedChanged(unexported);
        subscriptions.push(
          controller.onContentChange((path) => autosave.contentChanged(path)),
          controller.onDirtyChange((path) => autosave.contentChanged(path)),
          controller.onTreeChange((change) => autosave.treeChanged(change)),
          controller.onLayoutChange((layout) => autosave.layoutChanged(layout)),
        );
      }
      ctx.runtime.editorSubscriptions = subscriptions;
    },
    editorFailed: (id, error) => {
      const workspace = current(id);
      if (!workspace) return;
      reportError(error);
      void stopAutosave(ctx);
      if (workspace.snapshot)
        setWorkspace(ctx, null, { phase: 'restoreFailed', restoreError: error });
      else setWorkspace(ctx, null, { phase: 'empty', uploadNotice: 'unknown' });
    },
    flushNow: () => {
      void ctx.runtime.autosave?.flushNow();
    },
  };
}
