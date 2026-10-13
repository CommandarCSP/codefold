// apps/zip-editor/src/business/hooks/session/downloadFlow.ts
import { messages } from '@/utils/messages';
import { announce, type FlowContext } from './flowContext';
import { canDownload } from './sessionBusiness';

export interface DownloadFlows {
  download(): Promise<void>;
}

/**
 * 다운로드(design.md 시퀀스 4).
 * - 2026-09: 내려받은 뒤에만 markExported를 부른다. 실패하면 기록을 바꾸지 않는다.
 * - 2026-09 · ADR-0025: markExported가 돌려준 지문 기록을 자동 저장 줄에 넣어 바로 저장한다. 내용은 넣지 않는다.
 */
export function createDownloadFlows(ctx: FlowContext): DownloadFlows {
  const { store, services } = ctx;
  return {
    download: async () => {
      const state = store.getState();
      const { controller, workspace } = state;
      if (!controller || !workspace || !canDownload(state)) return;
      store.setState({ downloading: true, downloadError: null });
      try {
        const request = await controller.createExportPlan();
        const blob = await workspace.source.exportZip(request);
        if (store.getState().workspace?.id !== workspace.id) return;
        services.saveFile(blob, workspace.zipName);
        const record = controller.markExported(request.plan);
        ctx.runtime.autosave?.downloadRecorded(record);
        announce(ctx, messages.downloadDone(workspace.zipName));
      } catch (error) {
        if (store.getState().workspace?.id === workspace.id)
          store.setState({ downloadError: error });
      } finally {
        store.setState({ downloading: false });
      }
    },
  };
}
