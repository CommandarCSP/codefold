// apps/zip-editor/src/business/hooks/viewModels/useSessionNoticesViewModel.ts
import { messages } from '@/utils/messages';
import { useAppContext, useAppState } from '../session/appContext';
import { classifyDownloadError, type DownloadFailure } from '../session/sessionBusiness';

function downloadFailedMessage({ reason, memoryHint }: DownloadFailure) {
  const text = messages.downloadFailed.reason;
  const detail =
    reason.kind === 'invalidItem'
      ? text.invalidItem(reason.path)
      : reason.kind === 'missingData'
        ? text.missingData
        : text.unknown;
  return {
    title: messages.downloadFailed.title,
    detail: memoryHint ? `${detail} ${messages.downloadFailed.outOfMemory}` : detail,
    retryLabel: messages.downloadFailed.retry,
  };
}

/**
 * 알림. 문구는 여기서 고른다.
 * 사건 알림(업로드 오류·큰 ZIP·다운로드 실패)은 사용자가 닫는다. 읽기 전용은 탭의 상태라 닫지 않는다.
 */
export function useSessionNoticesViewModel() {
  const { flows, store } = useAppContext();
  const uploadNotice = useAppState((state) => state.uploadNotice);
  const largeZip = useAppState((state) => state.largeZip);
  const largeZipDismissed = useAppState((state) => state.largeZipDismissed);
  const lost = useAppState((state) => state.lock === 'lost');
  const lostWithPending = useAppState((state) => state.lostWithPending);
  const autosaveHint = useAppState((state) => state.autosaveHint);
  const downloadError = useAppState((state) => state.downloadError);
  return {
    uploadMessage: uploadNotice ? messages.uploadNotice[uploadNotice] : null,
    largeZipMessage: largeZip && !largeZipDismissed ? messages.largeZip : null,
    readOnly: lost
      ? {
          title: messages.readOnly.title,
          detail: lostWithPending
            ? `${messages.readOnly.description} ${messages.readOnly.unsavedLost}`
            : messages.readOnly.description,
        }
      : null,
    autosaveHint: autosaveHint ? messages.autosaveHint : null,
    downloadFailed:
      downloadError === null || downloadError === undefined
        ? null
        : downloadFailedMessage(classifyDownloadError(downloadError, largeZip)),
    retryDownload: () => void flows.download(),
    dismissUpload: () => store.setState({ uploadNotice: null }),
    dismissLargeZip: () => store.setState({ largeZipDismissed: true }),
    dismissDownloadFailed: () => store.setState({ downloadError: null }),
  };
}

/** 저장이 실패했거나 저장할 수 없는 환경이면 배너. */
export function useStorageWarningViewModel() {
  return {
    visible: useAppState(
      (state) => state.saveStatus === 'failed' || state.saveStatus === 'unavailable',
    ),
  };
}

export function useLiveAnnouncerViewModel() {
  return { announcement: useAppState((state) => state.announcement) };
}
