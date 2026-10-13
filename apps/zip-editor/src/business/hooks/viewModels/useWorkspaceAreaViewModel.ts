// apps/zip-editor/src/business/hooks/viewModels/useWorkspaceAreaViewModel.ts
import { useNarrowScreen } from '../layout/useNarrowScreen';
import { useAppContext, useAppState } from '../session/appContext';
import { canUpload, workspaceView } from '../session/sessionBusiness';
import { resolveTheme } from '../theme/themeBusiness';

export function useWorkspaceAreaViewModel() {
  const { flows, store } = useAppContext();
  return {
    view: useAppState(workspaceView),
    workspace: useAppState((state) => state.workspace),
    lockGranted: useAppState((state) => state.lock === 'granted'),
    opening: useAppState((state) => state.phase === 'opening'),
    canUpload: useAppState(canUpload),
    theme: useAppState((state) => resolveTheme(state.theme, state.systemDark)),
    narrow: useNarrowScreen(),
    treeOpen: useAppState((state) => state.treeOpen),
    setTreeOpen: (open: boolean) => store.setState({ treeOpen: open }),
    openFiles: (files: File[]) => void flows.openFiles(files),
    takeOver: () => void flows.takeOver(),
    startEditing: () => void flows.startEditing(),
    retryRestore: () => void flows.resume(),
    discardSaved: () => void flows.discardSaved(),
  };
}
