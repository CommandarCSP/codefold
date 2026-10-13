// apps/zip-editor/src/business/hooks/session/sessionFlows.ts
import { createDownloadFlows, type DownloadFlows } from './downloadFlow';
import { createEditorFlows, type EditorFlows } from './editorFlow';
import { createFlowContext, type SessionFlowsDeps } from './flowContext';
import { createLockFlows, type LockFlows } from './lockFlow';
import { createOpenFlows, type OpenFlows } from './openFlow';
import { createRestoreFlows, type RestoreFlows } from './restoreFlow';

/** 앱의 세션 흐름 전체. 화면은 이 객체의 메서드만 부른다. 메서드를 콜백으로 떼어 넘겨도 된다(ADR-0017). */
export interface SessionFlows
  extends OpenFlows, EditorFlows, DownloadFlows, RestoreFlows, LockFlows {}

export function createSessionFlows(deps: SessionFlowsDeps): SessionFlows {
  const ctx = createFlowContext(deps);
  const restore = createRestoreFlows(ctx);
  return {
    ...createOpenFlows(ctx),
    ...createEditorFlows(ctx),
    ...createDownloadFlows(ctx),
    resume: restore.resume,
    discardSaved: restore.discardSaved,
    ...createLockFlows(ctx, restore.boot),
  };
}
