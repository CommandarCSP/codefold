// apps/zip-editor/src/components/domain/notices/LiveAnnouncer.tsx
import { useLiveAnnouncerViewModel } from '@/business/hooks/viewModels/useSessionNoticesViewModel';
import { LiveAnnouncerView } from '@/components/view/NoticeViews';

export function LiveAnnouncer() {
  const { announcement } = useLiveAnnouncerViewModel();
  return <LiveAnnouncerView announcement={announcement} />;
}
