import { createContext, useContext } from 'react';
import type { CodeEditorMessages } from '../messages';
import type { EditorWorkspace } from '../workspace';
import type { DockviewArea } from './dockview-area';

/** dockview가 그리는 패널·탭 컴포넌트가 작업 공간과 영역을 찾는 곳. */
export interface AreaContextValue {
  readonly workspace: EditorWorkspace;
  /** dockview가 준비되기 전에는 없다. */
  readonly area: DockviewArea | undefined;
  readonly messages: CodeEditorMessages;
}

export const AreaContext = createContext<AreaContextValue | null>(null);

export function useAreaContext(): AreaContextValue {
  const value = useContext(AreaContext);
  if (!value) throw new Error('AreaContext 안에서만 쓸 수 있습니다');
  return value;
}
