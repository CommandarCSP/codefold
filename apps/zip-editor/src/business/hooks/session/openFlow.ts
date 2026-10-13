// apps/zip-editor/src/business/hooks/session/openFlow.ts
import type { SaveStatus } from '@/store/stores/appStore';
import type { WorkspaceRepository } from '@/services/storage/workspaceRepository';
import type { ZipSource } from '@/services/zip/zipClient';
import {
  ensureRepository,
  isHolding,
  requestPersistenceOnce,
  setWorkspace,
  stopAutosave,
  trackWrite,
  type FlowContext,
} from './flowContext';
import {
  canUpload,
  classifyUploadError,
  isLargeZip,
  PERF_MARKS,
  pickDroppedFile,
  replaceConfirmation,
} from './sessionBusiness';

export interface OpenFlows {
  /** 파일 선택·끌어 놓기 둘 다 여기로 온다. */
  openFiles(files: readonly File[]): Promise<void>;
}

/**
 * ZIP 열기와 교체.
 * - 2026-09: 새 ZIP의 목록을 다 읽은 뒤에만 옛 작업 공간을 치운다. 실패하면 옛 에디터와 저장본이 그대로다.
 * - 2026-09: 여는 순간 에디터 청크를 미리 불러와, 내려받기와 목록 읽기를 겹친다.
 */
export function createOpenFlows(ctx: FlowContext): OpenFlows {
  const { store, services, dialogs } = ctx;

  async function saveNewWorkspace(
    repository: WorkspaceRepository,
    file: File,
  ): Promise<{ readonly saveStatus: SaveStatus; readonly storageId: string | undefined }> {
    try {
      const storageId = await repository.replace({
        zipName: file.name,
        zipBlob: file,
        now: ctx.now(),
      });
      return { saveStatus: 'saved', storageId };
    } catch {
      // 옛 저장본이 남으면 새로고침 때 옛 ZIP을 되살리자고 묻게 된다. 지울 수 있으면 지운다.
      // 지우지 못해도 이 작업 공간은 자동 저장을 붙이지 않으므로(storageId 없음) 옛 저장본에 섞이지 않는다.
      await repository.clear().catch(() => undefined);
      return { saveStatus: 'failed', storageId: undefined };
    }
  }

  async function openZip(file: File): Promise<void> {
    const previousPhase = store.getState().phase;
    store.setState({
      phase: 'opening',
      uploadNotice: null,
      largeZip: isLargeZip(file.size),
      largeZipDismissed: false,
    });
    performance.mark(PERF_MARKS.open);
    ctx.preloadEditor();
    let source: ZipSource;
    try {
      source = await services.openZip(file);
    } catch (error) {
      store.setState({ phase: previousPhase, uploadNotice: classifyUploadError(error) });
      return;
    }
    if (!isHolding(ctx)) {
      source.dispose();
      store.setState({ phase: previousPhase });
      return;
    }
    dialogs.hideRestorePrompt();
    await stopAutosave(ctx);
    const repository = await ensureRepository(ctx);
    const { saveStatus, storageId } = repository
      ? await trackWrite(ctx, saveNewWorkspace(repository, file))
      : { saveStatus: 'unavailable' as const, storageId: undefined };
    if (saveStatus === 'saved') requestPersistenceOnce(ctx);
    // 저장본에 쓰는 사이 잠금을 잃었으면 열지 않는다. 가져간 탭이 방금 쓴 저장본을 읽는다(ADR-0024).
    if (!isHolding(ctx)) {
      source.dispose();
      store.setState({ phase: previousPhase });
      return;
    }
    setWorkspace(
      ctx,
      { zipName: file.name, source, ...(storageId === undefined ? {} : { storageId }) },
      { phase: 'ready', saved: null, restoreError: null, saveStatus },
    );
  }

  return {
    openFiles: async (files) => {
      if (!canUpload(store.getState())) return;
      const picked = pickDroppedFile(files);
      if (picked.kind === 'none') return;
      if (picked.kind === 'multiple') {
        store.setState({ uploadNotice: 'multiple' });
        return;
      }
      const confirmation = replaceConfirmation(store.getState());
      if (confirmation && !(await dialogs.confirm(confirmation))) return;
      if (!canUpload(store.getState())) return;
      await openZip(picked.file);
    },
  };
}
