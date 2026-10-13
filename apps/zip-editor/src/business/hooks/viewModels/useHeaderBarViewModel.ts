// apps/zip-editor/src/business/hooks/viewModels/useHeaderBarViewModel.ts
import { useNarrowScreen } from '../layout/useNarrowScreen';
import { useAppContext, useAppState } from '../session/appContext';
import { canDownload, canUpload } from '../session/sessionBusiness';

export function useHeaderBarViewModel() {
  const { flows, store } = useAppContext();
  const narrow = useNarrowScreen();
  const hasWorkspace = useAppState((state) => state.workspace !== null);
  return {
    canUpload: useAppState(canUpload),
    canDownload: useAppState(canDownload),
    downloading: useAppState((state) => state.downloading),
    unexportedCount: useAppState((state) =>
      state.workspace && state.unexported.has ? state.unexported.count : null,
    ),
    showTreeToggle: narrow && hasWorkspace,
    treeOpen: useAppState((state) => state.treeOpen),
    onFiles: (files: File[]) => void flows.openFiles(files),
    onDownload: () => void flows.download(),
    onTreeToggle: () => store.setState({ treeOpen: !store.getState().treeOpen }),
  };
}
