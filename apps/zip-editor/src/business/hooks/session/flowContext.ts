// apps/zip-editor/src/business/hooks/session/flowContext.ts
import type { Disposable } from '@codefold/virtual-fs';
import type { AppServices } from '@/services/appServices';
import type { SavedSummary, WorkspaceRepository } from '@/services/storage/workspaceRepository';
import type { AppState, AppStore, OpenWorkspace } from '@/store/stores/appStore';
import type { AutosaveScheduler } from '../autosave/autosaveScheduler';
import type { ConfirmOptions } from './sessionBusiness';

export interface RestorePromptProps {
  readonly saved: SavedSummary;
  readonly onResume: () => void;
  readonly onDiscard: () => void;
}

/** 흐름이 띄우는 대화상자. 실제는 nice-modal(작업 10), 테스트는 가짜다. */
export interface SessionDialogs {
  confirm(options: ConfirmOptions): Promise<boolean>;
  showRestorePrompt(props: RestorePromptProps): void;
  hideRestorePrompt(): void;
}

export interface SessionFlowsDeps {
  readonly store: AppStore;
  readonly services: AppServices;
  readonly dialogs: SessionDialogs;
  /** 에디터 청크를 미리 불러온다. */
  readonly preloadEditor: () => void;
  readonly wait?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** 여러 흐름이 함께 쓰는 값. React 상태가 아니다. */
export interface FlowRuntime {
  repositoryLoad: Promise<WorkspaceRepository | undefined> | undefined;
  repository: WorkspaceRepository | undefined;
  autosave: AutosaveScheduler | undefined;
  /** 자동 저장 밖에서 저장소에 쓰는 중인 일(새 ZIP 교체, 버리기). 잠금을 잃으면 끝나기를 기다린다. */
  pendingWrite: Promise<unknown> | undefined;
  editorSubscriptions: Disposable[];
  workspaceCount: number;
  persistRequested: boolean;
  handOver: AbortController | undefined;
  lostSubscription: Disposable | undefined;
  takingOver: boolean;
}

export interface FlowContext {
  readonly store: AppStore;
  readonly services: AppServices;
  readonly dialogs: SessionDialogs;
  readonly preloadEditor: () => void;
  readonly wait: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly runtime: FlowRuntime;
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFlowContext(deps: SessionFlowsDeps): FlowContext {
  return {
    store: deps.store,
    services: deps.services,
    dialogs: deps.dialogs,
    preloadEditor: deps.preloadEditor,
    wait: deps.wait ?? delay,
    now: deps.now ?? (() => Date.now()),
    runtime: {
      repositoryLoad: undefined,
      repository: undefined,
      autosave: undefined,
      pendingWrite: undefined,
      editorSubscriptions: [],
      workspaceCount: 0,
      persistRequested: false,
      handOver: undefined,
      lostSubscription: undefined,
      takingOver: false,
    },
  };
}

export const isHolding = (ctx: FlowContext) => ctx.store.getState().lock === 'holding';

/** 저장소는 한 번만 연다. 열 수 없으면 `unavailable`로 두고 undefined. */
export function ensureRepository(ctx: FlowContext): Promise<WorkspaceRepository | undefined> {
  ctx.runtime.repositoryLoad ??= ctx.services.openRepository().then(
    (repository) => {
      ctx.runtime.repository = repository;
      return repository;
    },
    () => {
      ctx.store.setState({ saveStatus: 'unavailable' });
      return undefined;
    },
  );
  return ctx.runtime.repositoryLoad;
}

/** 제어 API 구독을 풀고 자동 저장을 멈춘다. 진행 중 저장이 끝나면 돌아온다. */
export async function stopAutosave(ctx: FlowContext): Promise<{ readonly hadPending: boolean }> {
  for (const subscription of ctx.runtime.editorSubscriptions) subscription.dispose();
  ctx.runtime.editorSubscriptions = [];
  const autosave = ctx.runtime.autosave;
  ctx.runtime.autosave = undefined;
  return (await autosave?.stop()) ?? { hadPending: false };
}

/**
 * 작업 공간을 바꾼다. 새 번호가 `<CodeEditor key>`가 되어 탭·model·트리가 새로 만들어진다.
 * 옛 Worker는 새 작업 공간을 넣은 뒤에 끝낸다. 옛 에디터가 기다리던 읽기는 버려진다.
 */
export function setWorkspace(
  ctx: FlowContext,
  next: Omit<OpenWorkspace, 'id'> | null,
  extra: Partial<AppState> = {},
): void {
  const previous = ctx.store.getState().workspace;
  let workspace: OpenWorkspace | null = null;
  if (next) {
    ctx.runtime.workspaceCount += 1;
    workspace = { ...next, id: ctx.runtime.workspaceCount };
  }
  ctx.store.setState({
    workspace,
    controller: null,
    hasChanges: false,
    unexported: { has: false, count: 0 },
    downloadError: null,
    ...extra,
  });
  if (previous) previous.source.dispose();
}

export function announce(ctx: FlowContext, text: string): void {
  const current = ctx.store.getState().announcement;
  ctx.store.setState({ announcement: { id: (current?.id ?? 0) + 1, text } });
}

/** 저장소 쓰기를 `pendingWrite`로 걸어 두고 그 결과를 돌려준다. 끝나면(실패해도) 풀어 준다. */
export async function trackWrite<T>(ctx: FlowContext, write: Promise<T>): Promise<T> {
  const settled = write.then(
    () => undefined,
    () => undefined,
  );
  ctx.runtime.pendingWrite = settled;
  try {
    return await write;
  } finally {
    if (ctx.runtime.pendingWrite === settled) ctx.runtime.pendingWrite = undefined;
  }
}

/** 처음 작업 공간을 저장할 때 한 번만 요청한다. */
export function requestPersistenceOnce(ctx: FlowContext): void {
  if (ctx.runtime.persistRequested) return;
  ctx.runtime.persistRequested = true;
  void ctx.services.requestPersistence();
}
