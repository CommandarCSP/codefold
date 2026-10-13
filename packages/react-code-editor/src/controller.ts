import type { UnexportedState } from '@codefold/monaco-binding';
import type { Disposable, TreeChange } from '@codefold/virtual-fs';
import type { DockviewArea } from './area/dockview-area';
import { createEmitter } from './emitter';
import type { DownloadRecord, ExportPlan, ExportRequest, WorkspaceSnapshot } from './types';
import type { EditorWorkspace } from './workspace';

/**
 * 앱이 다운로드·자동 저장·복원·편집 잠금을 만들 때 쓰는 제어 API(design.md, ADR-0022).
 * 팩토리로 만든 객체라 메서드를 떼어 콜백으로 넘겨도 된다(ADR-0017). 구독은 값이 바뀔 때만 부른다.
 */
export interface CodeEditorController {
  hasChanges(): boolean;
  getDirtyPaths(): readonly string[];
  readText(path: string): Promise<string>;
  /** 자동 저장용 스냅샷. 에디터 영역 배치를 담는다. */
  getSnapshot(): Promise<WorkspaceSnapshot>;
  getSnapshotFor(paths: readonly string[]): Promise<Pick<WorkspaceSnapshot, 'contents'>>;
  getUnexportedCount(): number;
  createExportPlan(): Promise<ExportRequest>;
  markExported(plan: ExportPlan): DownloadRecord;
  /** 파일의 탭을 연다. */
  openFile(path: string): void;
  /** 편집 잠금을 잃은 탭(ADR-0024). `true`면 트리 조작과 에디터 편집을 막는다. */
  setReadOnly(readOnly: boolean): void;
  onDirtyChange(listener: (path: string, dirty: boolean) => void): Disposable;
  onChangesChange(listener: (hasChanges: boolean) => void): Disposable;
  onUnexportedChange(listener: (state: UnexportedState) => void): Disposable;
  /** 입력마다 부른다. React 상태로 올리지 말 것. */
  onContentChange(listener: (path: string) => void): Disposable;
  onTreeChange(listener: (change: TreeChange) => void): Disposable;
  onLayoutChange(listener: (layout: unknown) => void): Disposable;
}

/**
 * 지금 붙은 에디터 영역. dockview는 StrictMode 등에서 영역을 다시 만들 수 있어, 제어 API는 영역을 직접 잡지 않고
 * 이 자리를 거쳐 늘 지금 영역을 쓴다.
 */
export interface AreaSlot {
  current(): DockviewArea | undefined;
  set(area: DockviewArea): void;
  onLayoutChange(listener: (layout: unknown) => void): Disposable;
}

export function createAreaSlot(): AreaSlot {
  let area: DockviewArea | undefined;
  let subscription: Disposable | undefined;
  const emitter = createEmitter<unknown>();
  return {
    current: () => area,
    set: (next) => {
      if (next === area) return;
      subscription?.dispose();
      area = next;
      subscription = next.onLayoutChange((layout) => emitter.emit(layout));
    },
    onLayoutChange: (listener) => emitter.subscribe(listener),
  };
}

export function createController(workspace: EditorWorkspace, area: AreaSlot): CodeEditorController {
  return {
    hasChanges: () => workspace.hasChanges(),
    getDirtyPaths: () => workspace.getDirtyPaths(),
    readText: (path) => workspace.readText(path),
    getSnapshot: async () => ({
      ...(await workspace.getSnapshot()),
      layout: area.current()?.layout() ?? null,
    }),
    getSnapshotFor: (paths) => workspace.getSnapshotFor(paths),
    getUnexportedCount: () => workspace.getUnexportedCount(),
    createExportPlan: () => workspace.createExportPlan(),
    markExported: (plan) => workspace.markExported(plan),
    openFile: (path) => workspace.openFile(path),
    setReadOnly: (readOnly) => workspace.store.getState().setReadOnly(readOnly),
    onDirtyChange: (listener) => workspace.onDirtyChange(listener),
    onChangesChange: (listener) => workspace.onChangesChange(listener),
    onUnexportedChange: (listener) => workspace.onUnexportedChange(listener),
    onContentChange: (listener) => workspace.onContentChange(listener),
    onTreeChange: (listener) => workspace.onTreeChange(listener),
    onLayoutChange: (listener) => area.onLayoutChange(listener),
  };
}
