// apps/zip-editor/src/components/domain/notices/StorageWarningBanner.tsx
import { useStorageWarningViewModel } from '@/business/hooks/viewModels/useSessionNoticesViewModel';
import { StorageWarningBannerView } from '@/components/view/NoticeViews';

export function StorageWarningBanner() {
  const { visible } = useStorageWarningViewModel();
  return visible ? <StorageWarningBannerView /> : null;
}
