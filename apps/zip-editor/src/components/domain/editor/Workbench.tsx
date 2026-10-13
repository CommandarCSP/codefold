// apps/zip-editor/src/components/domain/editor/Workbench.tsx
import { useAppLifecycle } from '@/business/hooks/lifecycle/useAppLifecycle';
import { HeaderBar } from '@/components/domain/header/HeaderBar';
import { LiveAnnouncer } from '@/components/domain/notices/LiveAnnouncer';
import { SessionNotices } from '@/components/domain/notices/SessionNotices';
import { StorageWarningBanner } from '@/components/domain/notices/StorageWarningBanner';
import { DropZone } from '@/components/domain/upload/DropZone';
import { WorkspaceArea } from '@/components/domain/workspace/WorkspaceArea';
import { AppShellView } from '@/components/view/AppShellView';

/** 편집 화면 전체. 앱이 사는 동안 한 번 마운트된다. */
export function Workbench() {
  useAppLifecycle();
  return (
    <AppShellView
      header={<HeaderBar />}
      banner={<StorageWarningBanner />}
      notices={<SessionNotices />}
      overlay={
        <>
          <DropZone />
          <LiveAnnouncer />
        </>
      }
    >
      <WorkspaceArea />
    </AppShellView>
  );
}
