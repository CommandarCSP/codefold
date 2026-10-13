// apps/zip-editor/src/components/domain/workspace/WorkspaceArea.tsx
import { Suspense, use } from 'react';
import { useAppContext } from '@/business/hooks/session/appContext';
import { useWorkspaceAreaViewModel } from '@/business/hooks/viewModels/useWorkspaceAreaViewModel';
import { loadEditorModule, type EditorHostProps } from '@/business/hooks/workspace/editorModule';
import { LocalErrorBoundary } from '@/components/error/LocalErrorBoundary';
import { EditLockNoticeView } from '@/components/view/EditLockNoticeView';
import { EditorFrameView } from '@/components/view/EditorFrameView';
import { EmptyStateView } from '@/components/view/EmptyStateView';
import { OpeningStateView } from '@/components/view/OpeningStateView';
import { RestoreFailedView } from '@/components/view/RestoreFailedView';

function EditorSlot(props: Omit<EditorHostProps, 'onReady' | 'onError'>) {
  const { loadEditor, flows } = useAppContext();
  const { EditorHost } = use(loadEditorModule(loadEditor));
  return <EditorHost {...props} onReady={flows.editorReady} onError={flows.editorFailed} />;
}

/** 본문(layout-skeleton.md `<main>`). 세션 단계에 따라 하나만 그린다. */
export function WorkspaceArea() {
  const vm = useWorkspaceAreaViewModel();
  switch (vm.view) {
    case 'booting':
      return null;
    case 'lock':
      return (
        <EditLockNoticeView
          state={vm.lockGranted ? 'granted' : 'busy'}
          onTakeOver={vm.takeOver}
          onStart={vm.startEditing}
        />
      );
    case 'empty':
      return <EmptyStateView canUpload={vm.canUpload} onFiles={vm.openFiles} />;
    case 'opening':
      return <OpeningStateView />;
    case 'restoreFailed':
      return <RestoreFailedView onRetry={vm.retryRestore} onDiscard={vm.discardSaved} />;
    case 'editor':
      if (!vm.workspace) return null;
      return (
        <EditorFrameView busy={vm.opening}>
          <LocalErrorBoundary>
            <Suspense fallback={<OpeningStateView />}>
              <EditorSlot
                workspace={vm.workspace}
                theme={vm.theme}
                narrow={vm.narrow}
                treeOpen={vm.treeOpen}
                onTreeOpenChange={vm.setTreeOpen}
              />
            </Suspense>
          </LocalErrorBoundary>
        </EditorFrameView>
      );
  }
}
