// apps/zip-editor/src/business/hooks/workspace/editorModule.ts
import type { CodeEditorController, ThemeMode } from '@codefold/react-code-editor';
import type { ComponentType } from 'react';
import type { OpenWorkspace } from '@/store/stores/appStore';

/** 에디터 청크의 진입 컴포넌트가 받는 값. 앱은 이 모양으로만 `<CodeEditor>`를 부른다. */
export interface EditorHostProps {
  readonly workspace: OpenWorkspace;
  readonly theme: ThemeMode;
  readonly narrow: boolean;
  readonly treeOpen: boolean;
  readonly onTreeOpenChange: (open: boolean) => void;
  readonly onReady: (workspaceId: number, controller: CodeEditorController) => void;
  readonly onError: (workspaceId: number, error: unknown) => void;
}

export interface EditorModule {
  readonly EditorHost: ComponentType<EditorHostProps>;
}

export type EditorLoader = () => Promise<EditorModule>;

const loads = new WeakMap<EditorLoader, Promise<EditorModule>>();

/**
 * 에디터 청크(dockview·Monaco 포함)를 loader마다 한 번만 불러온다. 흐름의 미리 불러오기와 화면의 `use()`가
 * 같은 Promise를 나눠 쓴다. 실패하면 기억을 지워 에러 경계의 다시 시도가 다시 내려받게 한다.
 */
export function loadEditorModule(loader: EditorLoader): Promise<EditorModule> {
  const existing = loads.get(loader);
  if (existing) return existing;
  const load = loader();
  loads.set(loader, load);
  load.catch(() => {
    if (loads.get(loader) === load) loads.delete(loader);
  });
  return load;
}
