// apps/zip-editor/src/test/fakes.ts
import type {
  CodeEditorController,
  DownloadRecord,
  ExportPlan,
  ExportRequest,
} from '@codefold/react-code-editor';
import type { Disposable, TreeChange } from '@codefold/virtual-fs';
import { vi } from 'vitest';
import type { ConfirmOptions } from '@/business/hooks/session/sessionBusiness';
import type { RestorePromptProps, SessionDialogs } from '@/business/hooks/session/flowContext';
import { createSessionFlows } from '@/business/hooks/session/sessionFlows';
import type { AppServices } from '@/services/appServices';
import { createEditLock, type EditLock } from '@/services/lock/editLock';
import { createLockChannel, type LockChannel } from '@/services/lock/lockChannel';
import {
  createFakeChannelHub,
  type FakeChannelHub,
} from '@/services/lock/__tests__/fakeChannelHub';
import {
  createFakeLockManager,
  type FakeLockManager,
} from '@/services/lock/__tests__/fakeLockManager';
import {
  StorageUnavailableError,
  WorkspaceCorruptError,
  WorkspaceMissingError,
  type UnexportedSummary,
  type WorkspaceChanges,
  type WorkspaceRecord,
  type WorkspaceRepository,
} from '@/services/storage/workspaceRepository';
import type { ZipSource } from '@/services/zip/zipClient';
import { createAppStore, type AppState } from '@/store/stores/appStore';

export interface FakeZipSource extends ZipSource {
  readonly disposed: boolean;
  readonly exported: ExportRequest[];
  /** 다음 exportZip 결과. Error면 던진다. */
  result: Blob | Error;
}

export function createFakeZipSource(): FakeZipSource {
  let disposed = false;
  const source: FakeZipSource = {
    exported: [],
    result: new Blob(['PK'], { type: 'application/zip' }),
    get disposed() {
      return disposed;
    },
    list: async () => [],
    readHead: async () => new Uint8Array(),
    readAll: async () => new Uint8Array(),
    exportZip: async (request) => {
      source.exported.push(request);
      if (source.result instanceof Error) throw source.result;
      return source.result;
    },
    dispose: () => {
      disposed = true;
    },
  };
  return source;
}

function emitter<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>();
  return {
    subscribe: (listener: (...args: T) => void): Disposable => {
      listeners.add(listener);
      return { dispose: () => void listeners.delete(listener) };
    },
    emit: (...args: T) => {
      for (const listener of [...listeners]) listener(...args);
    },
    size: () => listeners.size,
  };
}

/** `<CodeEditor>` 제어 API 흉내. `contents`가 지금 고친 파일과 그 내용이다. */
export interface FakeController extends CodeEditorController {
  readonly contents: Map<string, string>;
  readonly marked: ExportPlan[];
  readonly readOnly: boolean;
  exportRequest: ExportRequest;
  readonly emit: {
    dirty(path: string, dirty: boolean): void;
    changes(hasChanges: boolean): void;
    unexported(state: UnexportedSummary): void;
    content(path: string): void;
    tree(change: TreeChange): void;
    layout(layout: unknown): void;
  };
  listenerCount(): number;
}

export function createFakeController(
  options: {
    hasChanges?: boolean;
    unexportedCount?: number;
    contents?: Record<string, string>;
  } = {},
): FakeController {
  const dirty = emitter<[string, boolean]>();
  const changes = emitter<[boolean]>();
  const unexported = emitter<[UnexportedSummary]>();
  const content = emitter<[string]>();
  const tree = emitter<[TreeChange]>();
  const layout = emitter<[unknown]>();
  let hasChanges = options.hasChanges ?? false;
  let unexportedCount = options.unexportedCount ?? 0;
  let readOnly = false;
  const plan: ExportPlan = {
    entries: [{ type: 'write', path: 'a.txt', originalPath: 'a.txt' }],
    versions: { 'a.txt': 3 },
    structureVersion: 0,
    hashes: { 'a.txt': 'ab12' },
    paths: ['a.txt'],
  };
  const controller: FakeController = {
    contents: new Map(Object.entries(options.contents ?? {})),
    marked: [],
    get readOnly() {
      return readOnly;
    },
    exportRequest: { plan, dirtyContents: { 'a.txt': new TextEncoder().encode('고친 내용') } },
    emit: {
      dirty: (path, value) => dirty.emit(path, value),
      changes: (value) => {
        hasChanges = value;
        changes.emit(value);
      },
      unexported: (state) => {
        unexportedCount = state.count;
        unexported.emit(state);
      },
      content: (path) => content.emit(path),
      tree: (change) => tree.emit(change),
      layout: (value) => layout.emit(value),
    },
    listenerCount: () =>
      dirty.size() +
      changes.size() +
      unexported.size() +
      content.size() +
      tree.size() +
      layout.size(),
    hasChanges: () => hasChanges,
    getDirtyPaths: () => [...controller.contents.keys()],
    readText: async (path) => controller.contents.get(path) ?? '',
    getSnapshot: async () => ({
      treeChanges: [],
      contents: Object.fromEntries(controller.contents),
      layout: null,
      downloadRecord: null,
    }),
    getSnapshotFor: async (paths) => ({
      contents: Object.fromEntries(
        paths.flatMap((path) => {
          const text = controller.contents.get(path);
          return text === undefined ? [] : [[path, text] as const];
        }),
      ),
    }),
    getUnexportedCount: () => unexportedCount,
    createExportPlan: vi.fn(async () => controller.exportRequest),
    markExported: vi.fn((exported: ExportPlan): DownloadRecord => {
      controller.marked.push(exported);
      return { files: exported.hashes, paths: exported.paths, exportedAt: 1000 };
    }),
    openFile: vi.fn(),
    setReadOnly: (value) => {
      readOnly = value;
    },
    onDirtyChange: (listener) => dirty.subscribe(listener),
    onChangesChange: (listener) => changes.subscribe(listener),
    onUnexportedChange: (listener) => unexported.subscribe(listener),
    onContentChange: (listener) => content.subscribe(listener),
    onTreeChange: (listener) => tree.subscribe(listener),
    onLayoutChange: (listener) => layout.subscribe(listener),
  };
  return controller;
}

export function baseRecord(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: 'ws-1',
    zipName: 'project.zip',
    zipBlob: new Blob(['PK']),
    createdAt: 1,
    updatedAt: 2,
    treeChanges: [],
    layout: null,
    downloadRecord: null,
    unexported: { has: false, count: 0 },
    ...overrides,
  };
}

/** 메모리 저장소. `failNext`에 오류를 넣으면 다음 쓰기가 그 오류로 끝난다. */
export interface FakeRepository extends WorkspaceRepository {
  record: WorkspaceRecord | null;
  readonly files: Map<string, string>;
  readonly saves: WorkspaceChanges[];
  failNext: Error | null;
  corrupt: boolean;
  /** 다음 save를 이 Promise가 끝날 때까지 붙잡는다. */
  gate: Promise<void> | null;
  /** 다음 replace를 이 Promise가 끝날 때까지 붙잡는다. */
  replaceGate: Promise<void> | null;
  readonly calls: { readSummary: number; load: number; replace: number; clear: number };
}

export function createFakeRepository(
  initial: { record?: Partial<WorkspaceRecord>; files?: Record<string, string> } = {},
): FakeRepository {
  const takeFailure = () => {
    const error = repository.failNext;
    repository.failNext = null;
    if (error) throw error;
  };
  let replaced = 1;
  const guard = () => {
    if (repository.corrupt) throw new WorkspaceCorruptError('테스트에서 망가뜨림');
  };
  const repository: FakeRepository = {
    record: initial.record ? baseRecord(initial.record) : null,
    files: new Map(Object.entries(initial.files ?? {})),
    saves: [],
    failNext: null,
    corrupt: false,
    gate: null,
    replaceGate: null,
    calls: { readSummary: 0, load: 0, replace: 0, clear: 0 },
    readSummary: async () => {
      repository.calls.readSummary += 1;
      guard();
      const { record } = repository;
      return (
        record && {
          zipName: record.zipName,
          updatedAt: record.updatedAt,
          unexported: record.unexported,
        }
      );
    },
    load: async () => {
      repository.calls.load += 1;
      guard();
      return (
        repository.record && {
          record: repository.record,
          files: Object.fromEntries(repository.files),
        }
      );
    },
    replace: async ({ zipName, zipBlob, now }) => {
      repository.calls.replace += 1;
      const gate = repository.replaceGate;
      repository.replaceGate = null;
      if (gate) await gate;
      takeFailure();
      replaced += 1;
      const id = `ws-${replaced}`;
      repository.record = baseRecord({ id, zipName, zipBlob, createdAt: now, updatedAt: now });
      repository.files.clear();
      return id;
    },
    save: async (changes) => {
      const gate = repository.gate;
      repository.gate = null;
      if (gate) await gate;
      takeFailure();
      const { record } = repository;
      if (!record || record.id !== changes.workspaceId) throw new WorkspaceMissingError();
      repository.saves.push(changes);
      repository.record = {
        ...record,
        updatedAt: changes.updatedAt,
        ...(changes.treeChanges ? { treeChanges: changes.treeChanges } : {}),
        ...('layout' in changes ? { layout: changes.layout ?? null } : {}),
        ...(changes.downloadRecord ? { downloadRecord: changes.downloadRecord } : {}),
        ...(changes.unexported ? { unexported: changes.unexported } : {}),
      };
      for (const [path, text] of Object.entries(changes.files?.put ?? {}))
        repository.files.set(path, text);
      for (const path of changes.files?.remove ?? []) repository.files.delete(path);
    },
    clear: async () => {
      repository.calls.clear += 1;
      takeFailure();
      repository.record = null;
      repository.files.clear();
    },
  };
  return repository;
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 한 브라우저 안의 "탭" 여럿이 나눠 쓰는 것: 잠금 관리자, 채널, IndexedDB. */
export interface SharedBrowser {
  readonly lockManager: FakeLockManager;
  readonly hub: FakeChannelHub;
  readonly repository: FakeRepository;
}

export function createSharedBrowser(
  repository: FakeRepository = createFakeRepository(),
): SharedBrowser {
  return { lockManager: createFakeLockManager(), hub: createFakeChannelHub(), repository };
}

export interface FakeServices extends AppServices {
  readonly shared: SharedBrowser;
  readonly repository: FakeRepository;
  readonly sources: FakeZipSource[];
  readonly saved: Array<{ readonly blob: Blob; readonly fileName: string }>;
  /** 같은 브라우저의 다른 탭이 쓰는 잠금과 채널. */
  readonly otherTab: { readonly editLock: EditLock; readonly lockChannel: LockChannel };
  openZipError: Error | null;
  /** 다음 openZip을 이 Promise가 끝날 때까지 붙잡는다. */
  openZipGate: Promise<void> | null;
  repositoryAvailable: boolean;
  persistCalls: number;
  readonly openZipCalls: Blob[];
}

export function createFakeServices(shared: SharedBrowser = createSharedBrowser()): FakeServices {
  const services: FakeServices = {
    shared,
    repository: shared.repository,
    sources: [],
    saved: [],
    otherTab: {
      editLock: createEditLock(() => shared.lockManager),
      lockChannel: createLockChannel(shared.hub.open),
    },
    openZipError: null,
    openZipGate: null,
    repositoryAvailable: true,
    persistCalls: 0,
    openZipCalls: [],
    openZip: async (blob) => {
      services.openZipCalls.push(blob);
      const gate = services.openZipGate;
      services.openZipGate = null;
      if (gate) await gate;
      if (services.openZipError) throw services.openZipError;
      const source = createFakeZipSource();
      services.sources.push(source);
      return source;
    },
    openRepository: async () => {
      if (!services.repositoryAvailable) throw new StorageUnavailableError(new Error('테스트'));
      return shared.repository;
    },
    editLock: createEditLock(() => shared.lockManager),
    lockChannel: createLockChannel(shared.hub.open),
    saveFile: (blob, fileName) => {
      services.saved.push({ blob, fileName });
    },
    requestPersistence: async () => {
      services.persistCalls += 1;
      return true;
    },
    scheduleIdle: (task) => {
      const handle = setTimeout(task, 0);
      return () => clearTimeout(handle);
    },
  };
  return services;
}

export interface FakeDialogs extends SessionDialogs {
  readonly confirms: ConfirmOptions[];
  /** confirm이 차례로 돌려줄 답. 비면 false(취소). */
  readonly answers: boolean[];
  restorePrompt: RestorePromptProps | null;
}

export function createFakeDialogs(): FakeDialogs {
  const dialogs: FakeDialogs = {
    confirms: [],
    answers: [],
    restorePrompt: null,
    confirm: async (options) => {
      dialogs.confirms.push(options);
      return dialogs.answers.shift() ?? false;
    },
    showRestorePrompt: (props) => {
      dialogs.restorePrompt = props;
    },
    hideRestorePrompt: () => {
      dialogs.restorePrompt = null;
    },
  };
  return dialogs;
}

/** 흐름 합성 테스트용. 처음 상태는 잠금을 쥔 빈 화면이다. */
export function createTestFlows(
  options: {
    state?: Partial<AppState>;
    services?: FakeServices;
    wait?: (ms: number) => Promise<void>;
  } = {},
) {
  const store = createAppStore({ lock: 'holding', phase: 'empty', ...options.state });
  const services = options.services ?? createFakeServices();
  const dialogs = createFakeDialogs();
  const preloadEditor = vi.fn();
  const flows = createSessionFlows({
    store,
    services,
    dialogs,
    preloadEditor,
    ...(options.wait ? { wait: options.wait } : {}),
  });
  return { flows, store, services, dialogs, preloadEditor };
}

export const zipFile = (name = 'project.zip', size?: number) => {
  const file = new File(['PK'], name, { type: 'application/zip' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
};
