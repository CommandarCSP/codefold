// apps/zip-editor/src/store/stores/appStore.ts
import type { CodeEditorController, WorkspaceSnapshot } from '@codefold/react-code-editor';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ThemePreference } from '@/services/browser/theme';
import type { SavedSummary, UnexportedSummary } from '@/services/storage/workspaceRepository';
import type { ZipSource } from '@/services/zip/zipClient';

/** 본문이 무엇을 보이는지(design.md "상태 위치"). `booting`은 잠금 판정과 저장본 확인 전이다. */
export type SessionPhase =
  'booting' | 'empty' | 'opening' | 'restorePrompt' | 'restoring' | 'restoreFailed' | 'ready';
export type SaveStatus = 'saved' | 'pending' | 'failed' | 'unavailable';
/** `pending`: 판정 전, `busy`: 다른 탭이 쥠, `granted`: 넘어왔지만 "편집 시작" 전, `lost`: 빼앗김(ADR-0024). */
export type LockState = 'pending' | 'holding' | 'busy' | 'granted' | 'lost';
export type { ThemePreference } from '@/services/browser/theme';
export type UploadNotice = 'multiple' | 'notZip' | 'corrupt' | 'encrypted' | 'split' | 'unknown';

/** 열린 작업 공간. `id`는 `<CodeEditor key>`로 쓴다. `snapshot`은 복원할 때만 있다. */
export interface OpenWorkspace {
  readonly id: number;
  /** 저장본의 작업 공간 id. 저장본에 두지 못했으면 없고, 그러면 자동 저장을 붙이지 않는다. */
  readonly storageId?: string;
  readonly zipName: string;
  readonly source: ZipSource;
  readonly snapshot?: WorkspaceSnapshot;
}

/** 라이브 영역 안내. 같은 문구를 다시 읽게 `id`를 올린다. */
export interface Announcement {
  readonly id: number;
  readonly text: string;
}

export interface AppState {
  readonly phase: SessionPhase;
  readonly workspace: OpenWorkspace | null;
  readonly controller: CodeEditorController | null;
  readonly saved: SavedSummary | null;
  readonly restoreError: unknown;
  readonly uploadNotice: UploadNotice | null;
  readonly largeZip: boolean;
  /** 큰 ZIP 경고를 닫았는지. `largeZip`은 다운로드 실패 안내의 메모리 힌트에도 쓰여 따로 둔다. */
  readonly largeZipDismissed: boolean;
  readonly hasChanges: boolean;
  readonly unexported: UnexportedSummary;
  readonly saveStatus: SaveStatus;
  readonly lock: LockState;
  readonly lostWithPending: boolean;
  readonly downloading: boolean;
  readonly downloadError: unknown;
  readonly treeOpen: boolean;
  readonly theme: ThemePreference;
  readonly systemDark: boolean;
  readonly autosaveHint: boolean;
  readonly announcement: Announcement | null;
}

export type AppStore = StoreApi<AppState>;

export const initialAppState: AppState = {
  phase: 'booting',
  workspace: null,
  controller: null,
  saved: null,
  restoreError: null,
  uploadNotice: null,
  largeZip: false,
  largeZipDismissed: false,
  hasChanges: false,
  unexported: { has: false, count: 0 },
  saveStatus: 'saved',
  lock: 'pending',
  lostWithPending: false,
  downloading: false,
  downloadError: null,
  treeOpen: false,
  theme: 'system',
  systemDark: false,
  autosaveHint: false,
  announcement: null,
};

/** 앱마다(테스트마다) 새 스토어를 만든다. 입력마다 바뀌는 값은 두지 않는다(ADR-0006). */
export function createAppStore(overrides: Partial<AppState> = {}): AppStore {
  return createStore<AppState>()(() => ({ ...initialAppState, ...overrides }));
}
