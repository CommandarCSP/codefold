// apps/zip-editor/src/business/hooks/session/sessionBusiness.ts
import type { WorkspaceSnapshot } from '@codefold/react-code-editor';
import {
  CorruptZipError,
  EncryptedZipError,
  InvalidZipItemError,
  NotZipError,
  SplitZipError,
} from '@codefold/zip-archive';
import type { StoredWorkspace } from '@/services/storage/workspaceRepository';
import { MissingExportDataError } from '@/services/zip/zipProtocol';
import type { AppState, UploadNotice } from '@/store/stores/appStore';
import { messages } from '@/utils/messages';

/** 1GB를 넘으면 경고만 하고 연다(사용자 결정 ND-1). */
export const LARGE_ZIP_BYTES = 1024 ** 3;
/** 잠금을 가져온 뒤 "저장 끝남"을 기다리는 최대 시간. */
export const TAKEOVER_WAIT_MS = 1000;
/** ZIP 열기 → 트리 준비 시간 측정 이름. 성능 측정(`perf/perf.spec.ts`, CI 성능 작업)이 읽는다. */
export const PERF_MARKS = { open: 'codefold:zip-open', ready: 'codefold:tree-ready' } as const;

export type PickedFile =
  | { readonly kind: 'none' }
  | { readonly kind: 'multiple' }
  | { readonly kind: 'single'; readonly file: File };

export function pickDroppedFile(files: readonly File[]): PickedFile {
  const [first] = files;
  if (!first) return { kind: 'none' };
  return files.length > 1 ? { kind: 'multiple' } : { kind: 'single', file: first };
}

export function isLargeZip(size: number): boolean {
  return size > LARGE_ZIP_BYTES;
}

export function classifyUploadError(error: unknown): UploadNotice {
  if (error instanceof NotZipError) return 'notZip';
  if (error instanceof CorruptZipError) return 'corrupt';
  if (error instanceof EncryptedZipError) return 'encrypted';
  if (error instanceof SplitZipError) return 'split';
  return 'unknown';
}

export type DownloadFailureReason =
  | { readonly kind: 'invalidItem'; readonly path: string }
  | { readonly kind: 'missingData' }
  | { readonly kind: 'unknown' };

export interface DownloadFailure {
  readonly reason: DownloadFailureReason;
  /** 큰 ZIP이거나 메모리를 잡지 못해 실패했으면 메모리 안내를 붙인다. */
  readonly memoryHint: boolean;
}

/** 다운로드 실패의 이유. Worker 오류는 zipProtocol이 같은 class로 되살려 둔다. */
export function classifyDownloadError(error: unknown, largeZip: boolean): DownloadFailure {
  const memoryHint = largeZip || error instanceof RangeError;
  if (error instanceof InvalidZipItemError)
    return { reason: { kind: 'invalidItem', path: error.path }, memoryHint };
  if (error instanceof MissingExportDataError)
    return { reason: { kind: 'missingData' }, memoryHint };
  return { reason: { kind: 'unknown' }, memoryHint };
}

export interface ConfirmOptions {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * 새 ZIP으로 바꾸기 전에 물을지와 무엇을 물을지.
 * - 2026-09: 열린 작업 공간에 받지 않은 변경이 있을 때만 묻는다.
 * - 2026-09: 복원 안내 중이면 저장본의 요약으로 정하고 이전 ZIP 이름을 보인다.
 *   복원 실패 화면이면 되살리지 못한 저장본이 사라지므로 늘 묻는다.
 */
export function replaceConfirmation(
  state: Pick<AppState, 'phase' | 'workspace' | 'unexported' | 'saved'>,
): ConfirmOptions | undefined {
  const base = {
    title: messages.replace.title,
    confirmLabel: messages.replace.confirm,
    cancelLabel: messages.replace.cancel,
  };
  if (state.workspace && state.unexported.has)
    return { ...base, description: messages.replace.description };
  if (state.phase === 'restorePrompt' && state.saved?.unexported.has) {
    return { ...base, description: messages.discardSaved(state.saved.zipName) };
  }
  if (state.phase === 'restoreFailed')
    return { ...base, description: messages.replace.unknownSaved };
  return undefined;
}

export function snapshotFromStored({ record, files }: StoredWorkspace): WorkspaceSnapshot {
  return {
    treeChanges: record.treeChanges,
    contents: files,
    layout: record.layout,
    downloadRecord: record.downloadRecord,
  };
}

/**
 * 새로고침·닫기 경고를 띄울지. 받지 않은 변경은 보지 않는다(ADR-0014).
 * - 2026-09 · ADR-0024: 잠금을 잃은 탭은 더 저장하지 않으므로 경고하지 않는다.
 */
export function shouldWarnBeforeUnload(
  state: Pick<AppState, 'workspace' | 'lock' | 'saveStatus'>,
): boolean {
  return state.workspace !== null && state.lock === 'holding' && state.saveStatus !== 'saved';
}

export function canUpload(state: Pick<AppState, 'lock' | 'phase'>): boolean {
  if (state.lock !== 'holding') return false;
  return (
    state.phase === 'empty' ||
    state.phase === 'ready' ||
    state.phase === 'restorePrompt' ||
    state.phase === 'restoreFailed'
  );
}

export function canDownload(
  state: Pick<AppState, 'phase' | 'controller' | 'hasChanges' | 'downloading'>,
): boolean {
  return (
    state.phase === 'ready' && state.controller !== null && state.hasChanges && !state.downloading
  );
}

export type WorkspaceView = 'booting' | 'lock' | 'empty' | 'opening' | 'restoreFailed' | 'editor';

export function workspaceView(
  state: Pick<AppState, 'lock' | 'workspace' | 'phase'>,
): WorkspaceView {
  if (state.lock === 'busy' || state.lock === 'granted') return 'lock';
  if (state.lock === 'pending') return 'booting';
  if (state.workspace) return 'editor';
  switch (state.phase) {
    case 'opening':
    case 'restoring':
      return 'opening';
    case 'restoreFailed':
      return 'restoreFailed';
    case 'booting':
      return 'booting';
    default:
      return 'empty';
  }
}
