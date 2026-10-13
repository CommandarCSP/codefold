// apps/zip-editor/src/components/domain/notices/SessionNotices.tsx
import { useSessionNoticesViewModel } from '@/business/hooks/viewModels/useSessionNoticesViewModel';
import {
  FloatingNoticesView,
  FloatingNoticeView,
  NoticeAlertView,
  NoticeStackView,
  NoticeToastView,
} from '@/components/view/NoticeViews';

/**
 * 읽기 전용은 탭의 상태라 상단에 남긴다. 나머지 사건 알림은 떠 있는 목록에 쌓아 에디터를 밀지 않는다.
 */
export function SessionNotices() {
  const vm = useSessionNoticesViewModel();
  return (
    <>
      <NoticeStackView>
        {vm.readOnly && (
          <NoticeAlertView
            tone="info"
            role="status"
            message={vm.readOnly.title}
            detail={vm.readOnly.detail}
          />
        )}
      </NoticeStackView>
      <FloatingNoticesView>
        {vm.uploadMessage && (
          <FloatingNoticeView
            tone="error"
            role="alert"
            message={vm.uploadMessage}
            onDismiss={vm.dismissUpload}
          />
        )}
        {vm.largeZipMessage && (
          <FloatingNoticeView
            tone="warning"
            role="status"
            message={vm.largeZipMessage}
            onDismiss={vm.dismissLargeZip}
          />
        )}
        {vm.downloadFailed && (
          <FloatingNoticeView
            tone="error"
            role="alert"
            message={vm.downloadFailed.title}
            detail={vm.downloadFailed.detail}
            action={{ label: vm.downloadFailed.retryLabel, onClick: vm.retryDownload }}
            onDismiss={vm.dismissDownloadFailed}
          />
        )}
        {vm.autosaveHint && <NoticeToastView message={vm.autosaveHint} />}
      </FloatingNoticesView>
    </>
  );
}
