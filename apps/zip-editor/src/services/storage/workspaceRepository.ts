import type { DownloadRecord } from '@codefold/react-code-editor';
import type { TreeChange } from '@codefold/virtual-fs';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'codefold';
/** 2: 원본 ZIP을 `zip` 저장소로 떼어 내고, 기록에 작업 공간 id를 둔다. */
const DB_VERSION = 2;
const CURRENT = 'current';
/** Blob을 넣을 수 있는지 알아볼 때만 잠깐 쓰는 키. 커밋하지 않는다. */
const PROBE = 'blob-probe';

export interface UnexportedSummary {
  readonly has: boolean;
  readonly count: number;
}

/** 작업 공간 하나. `load`가 돌려준다. 원본 ZIP은 `zip` 저장소에서 따로 읽어 붙인다. */
export interface WorkspaceRecord {
  /** `replace`할 때마다 새로 만든다. 자동 저장은 이 id가 같을 때만 쓴다. */
  readonly id: string;
  readonly zipName: string;
  readonly zipBlob: Blob;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly treeChanges: readonly TreeChange[];
  /** dockview 레이아웃 JSON. 아직 없으면 null. */
  readonly layout: unknown;
  /** 지문만 두고 내용은 두지 않는다(ADR-0025). */
  readonly downloadRecord: DownloadRecord | null;
  /** 복원 안내 중 새 ZIP을 놓을 때 확인할지 정한다. */
  readonly unexported: UnexportedSummary;
}

/** `files` 저장소. 원본과 달라진 텍스트 파일만 둔다. */
export interface StoredFile {
  readonly path: string;
  readonly text: string;
  readonly updatedAt: number;
}

export interface SavedSummary {
  readonly zipName: string;
  readonly updatedAt: number;
  readonly unexported: UnexportedSummary;
}

export interface StoredWorkspace {
  readonly record: WorkspaceRecord;
  readonly files: Readonly<Record<string, string>>;
}

/** 한 트랜잭션에서 쓰는 변경. 없는 필드는 그대로 둔다. */
export interface WorkspaceChanges {
  /** 이 변경이 속한 작업 공간. 저장본의 id와 다르면 쓰지 않는다. */
  readonly workspaceId: string;
  readonly updatedAt: number;
  readonly files?: {
    readonly put: Readonly<Record<string, string>>;
    readonly remove: readonly string[];
  };
  readonly treeChanges?: readonly TreeChange[];
  readonly layout?: unknown;
  readonly downloadRecord?: DownloadRecord;
  readonly unexported?: UnexportedSummary;
}

export interface WorkspaceRepository {
  readSummary(): Promise<SavedSummary | null>;
  load(): Promise<StoredWorkspace | null>;
  /** 세 저장소를 비우고 새 작업 공간을 둔다. 새 작업 공간의 id를 돌려준다. */
  replace(init: {
    readonly zipName: string;
    readonly zipBlob: Blob;
    readonly now: number;
  }): Promise<string>;
  /** 저장본이 없거나 다른 작업 공간이면 WorkspaceMissingError이고 아무것도 쓰지 않는다. */
  save(changes: WorkspaceChanges): Promise<void>;
  clear(): Promise<void>;
}

export class StorageUnavailableError extends Error {
  override readonly name = 'StorageUnavailableError';
  constructor(cause: unknown) {
    super('IndexedDB를 열 수 없습니다', { cause });
  }
}

export class WorkspaceCorruptError extends Error {
  override readonly name = 'WorkspaceCorruptError';
  constructor(detail: string) {
    super(`저장된 작업 공간이 손상되었습니다: ${detail}`);
  }
}

export class WorkspaceMissingError extends Error {
  override readonly name = 'WorkspaceMissingError';
  constructor() {
    super('저장된 작업 공간이 없습니다');
  }
}

/** `workspace` 저장소의 값. 원본 ZIP은 넣지 않는다. 저장마다 이 값을 다시 쓰므로 작게 둔다(ADR-0027). */
type WorkspaceMeta = Omit<WorkspaceRecord, 'zipBlob'>;

/**
 * `zip` 저장소의 값. `replace`할 때만 쓰고 `load`할 때만 읽는다.
 * 보통은 Blob을 그대로 둔다(디스크에 두고 메모리에 올리지 않는다). WebKit 일부 빌드(2026-09 확인,
 * Playwright WebKit)는 Blob이 든 값을 넣으면 요청이 UnknownError("Error preparing Blob/File data")로 끝나고,
 * 요청이 여럿인 트랜잭션은 error만 뜨고 abort·complete가 오지 않아 뒤의 트랜잭션까지 멈춘다.
 * 그래서 실제로 쓰기 전에 작은 Blob 하나로 한 번 알아보고(probeBlobWrites), 안 되면 바이트+MIME으로 둔다.
 */
type StoredZip = { readonly blob: Blob } | { readonly bytes: Uint8Array; readonly type: string };

interface CodefoldDB extends DBSchema {
  workspace: { key: string; value: WorkspaceMeta };
  files: { key: string; value: StoredFile };
  zip: { key: string; value: StoredZip };
}

const STORES = ['workspace', 'files', 'zip'] as const;

const newWorkspaceId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const ignore = () => undefined;

/**
 * 요청을 걸고 트랜잭션이 끝나기를 기다린다. 실패하면 트랜잭션의 오류(용량 초과 등)를 던진다.
 * 요청마다의 거절(AbortError)은 삼킨다(`track`). 요청을 걸다 곧바로 던지면(DataCloneError 등) 앞서 건
 * 요청이 커밋되지 않게 트랜잭션을 되돌리고 그 오류를 던진다.
 */
async function commit(
  tx: { abort(): void; readonly done: Promise<void> },
  issue: (track: (request: Promise<unknown>) => void) => void,
): Promise<void> {
  const done = tx.done;
  done.catch(ignore);
  try {
    issue((request) => void request.catch(ignore));
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // 이미 끝난 트랜잭션이다.
    }
    throw error;
  }
  await done;
}

function corrupt(detail: string): never {
  throw new WorkspaceCorruptError(detail);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isTreeChange(value: unknown): value is TreeChange {
  if (!isObject(value)) return false;
  if (value.type === 'add')
    return typeof value.path === 'string' && typeof value.isDirectory === 'boolean';
  if (value.type === 'delete') return typeof value.path === 'string';
  if (value.type === 'rename')
    return typeof value.from === 'string' && typeof value.to === 'string';
  return false;
}

function isDownloadRecord(value: unknown): value is DownloadRecord {
  return (
    isObject(value) &&
    isObject(value.files) &&
    Object.values(value.files).every((hash) => typeof hash === 'string') &&
    Array.isArray(value.paths) &&
    value.paths.every((path) => typeof path === 'string') &&
    isNumber(value.exportedAt)
  );
}

/** 기록의 모양을 확인한다. 브라우저 확장·옛 버전이 쓴 값일 수 있어 믿지 않는다. */
export function parseWorkspaceMeta(value: unknown): WorkspaceMeta {
  if (!isObject(value)) corrupt('기록이 객체가 아닙니다');
  const { id, zipName, createdAt, updatedAt, treeChanges, layout, downloadRecord, unexported } =
    value;
  if (typeof id !== 'string' || id === '') corrupt('작업 공간 id가 없습니다');
  if (typeof zipName !== 'string' || zipName === '') corrupt('ZIP 이름이 없습니다');
  if (!isNumber(createdAt) || !isNumber(updatedAt)) corrupt('시각이 잘못되었습니다');
  const changes =
    Array.isArray(treeChanges) && treeChanges.every(isTreeChange)
      ? treeChanges
      : corrupt('트리 변경 목록이 잘못되었습니다');
  const record =
    downloadRecord === null || downloadRecord === undefined
      ? null
      : isDownloadRecord(downloadRecord)
        ? downloadRecord
        : corrupt('다운로드 기록이 잘못되었습니다');
  const summary =
    isObject(unexported) && typeof unexported.has === 'boolean' && isNumber(unexported.count)
      ? { has: unexported.has, count: unexported.count }
      : corrupt('받지 않은 변경 요약이 잘못되었습니다');
  return {
    id,
    zipName,
    createdAt,
    updatedAt,
    treeChanges: changes,
    layout: layout ?? null,
    downloadRecord: record,
    unexported: summary,
  };
}

/** `zip` 저장소의 값을 Blob으로 되돌린다. 바이트로 두었으면 Blob을 만든 뒤 바이트는 붙잡지 않는다. */
export function parseStoredZip(value: unknown): Blob {
  if (isObject(value) && value.blob instanceof Blob) return value.blob;
  if (isObject(value) && value.bytes instanceof Uint8Array && typeof value.type === 'string') {
    return new Blob([value.bytes as Uint8Array<ArrayBuffer>], { type: value.type });
  }
  return corrupt('원본 ZIP이 없습니다');
}

/**
 * 버전 1 기록(원본 ZIP이 기록 안에 zipBlob 또는 zipBytes+zipType으로 들어 있음)을 나눈다.
 * 원본은 받은 모양 그대로 `zip` 저장소로 옮긴다. 바꾸지 않으므로 Blob 쓰기 문제도, 사본도 생기지 않는다.
 */
function splitV1Record(value: unknown): { meta: unknown; zip: StoredZip | undefined } {
  if (!isObject(value)) return { meta: value, zip: undefined };
  const { zipBlob, zipBytes, zipType, ...rest } = value;
  const zip: StoredZip | undefined =
    zipBytes instanceof Uint8Array && typeof zipType === 'string'
      ? { bytes: zipBytes, type: zipType }
      : zipBlob instanceof Blob
        ? { blob: zipBlob }
        : undefined;
  return { meta: { ...rest, id: newWorkspaceId() }, zip };
}

function parseFiles(values: readonly unknown[]): Record<string, string> {
  const files: Record<string, string> = {};
  for (const value of values) {
    if (!isObject(value) || typeof value.path !== 'string' || typeof value.text !== 'string') {
      corrupt('파일 내용이 잘못되었습니다');
    }
    files[value.path] = value.text;
  }
  return files;
}

function createRepository(db: IDBPDatabase<CodefoldDB>): WorkspaceRepository {
  const both = <Mode extends IDBTransactionMode>(mode: Mode) =>
    db.transaction(['workspace', 'files'], mode);
  // 이 브라우저가 Blob을 IndexedDB에 넣을 수 있는지. 처음 replace에서 한 번 알아낸다.
  let blobWrites: Promise<boolean> | undefined;

  /** 요청 하나짜리 트랜잭션에 작은 Blob을 넣어 보고 되돌린다. 요청이 하나면 실패해도 트랜잭션이 끝난다. */
  const probeBlobWrites = async (): Promise<boolean> => {
    const tx = db.transaction('zip', 'readwrite');
    const done = tx.done.catch(ignore);
    try {
      await tx.objectStore('zip').put({ blob: new Blob([new Uint8Array([0x50, 0x4b])]) }, PROBE);
      return true;
    } catch {
      return false;
    } finally {
      try {
        tx.abort();
      } catch {
        // 이미 끝났다.
      }
      await done;
    }
  };

  const writeNew = async (meta: WorkspaceMeta, zip: StoredZip) => {
    const tx = db.transaction(STORES, 'readwrite');
    await commit(tx, (track) => {
      track(tx.objectStore('files').clear());
      track(tx.objectStore('zip').put(zip, CURRENT));
      track(tx.objectStore('workspace').put(meta, CURRENT));
    });
  };

  return {
    readSummary: async () => {
      const value: unknown = await db.get('workspace', CURRENT);
      if (value === undefined) return null;
      const record = parseWorkspaceMeta(value);
      return {
        zipName: record.zipName,
        updatedAt: record.updatedAt,
        unexported: record.unexported,
      };
    },
    load: async () => {
      const tx = db.transaction(STORES, 'readonly');
      const [value, files, zip] = await Promise.all([
        tx.objectStore('workspace').get(CURRENT),
        tx.objectStore('files').getAll(),
        tx.objectStore('zip').get(CURRENT),
        tx.done,
      ]);
      if (value === undefined) return null;
      const meta = parseWorkspaceMeta(value);
      return { record: { ...meta, zipBlob: parseStoredZip(zip) }, files: parseFiles(files) };
    },
    replace: async ({ zipName, zipBlob, now }) => {
      const meta: WorkspaceMeta = {
        id: newWorkspaceId(),
        zipName,
        createdAt: now,
        updatedAt: now,
        treeChanges: [],
        layout: null,
        downloadRecord: null,
        unexported: { has: false, count: 0 },
      };
      blobWrites ??= probeBlobWrites();
      if (await blobWrites) {
        await writeNew(meta, { blob: zipBlob });
        return meta.id;
      }
      // Blob→bytes 변환은 트랜잭션을 열기 전에 끝낸다. 연 뒤에 await하면 idb가 유휴 트랜잭션으로 보고
      // 먼저 커밋해 버릴 수 있다. 이 경로에서만 ZIP 전체를 메모리에 올린다.
      const bytes = new Uint8Array(await zipBlob.arrayBuffer());
      await writeNew(meta, { bytes, type: zipBlob.type });
      return meta.id;
    },
    save: async (changes) => {
      const tx = both('readwrite');
      const workspace = tx.objectStore('workspace');
      const files = tx.objectStore('files');
      const value: unknown = await workspace.get(CURRENT);
      if (!isObject(value) || value.id !== changes.workspaceId) {
        // 저장본이 없거나 다른 ZIP으로 바뀌었다. 옛 작업 공간의 편집을 새 저장본에 섞지 않는다.
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new WorkspaceMissingError();
      }
      const current = value as unknown as WorkspaceMeta;
      const next: WorkspaceMeta = {
        ...current,
        updatedAt: changes.updatedAt,
        ...(changes.treeChanges ? { treeChanges: changes.treeChanges } : {}),
        ...('layout' in changes ? { layout: changes.layout ?? null } : {}),
        ...(changes.downloadRecord ? { downloadRecord: changes.downloadRecord } : {}),
        ...(changes.unexported ? { unexported: changes.unexported } : {}),
      };
      await commit(tx, (track) => {
        track(workspace.put(next, CURRENT));
        for (const [path, text] of Object.entries(changes.files?.put ?? {})) {
          track(files.put({ path, text, updatedAt: changes.updatedAt }));
        }
        for (const path of changes.files?.remove ?? []) track(files.delete(path));
      });
    },
    clear: async () => {
      const tx = db.transaction(STORES, 'readwrite');
      await commit(tx, (track) => {
        track(tx.objectStore('workspace').clear());
        track(tx.objectStore('files').clear());
        track(tx.objectStore('zip').clear());
      });
    },
  };
}

/** 저장소를 연다. 시크릿 모드 제한 등으로 열 수 없으면 StorageUnavailableError. */
export async function openWorkspaceRepository(): Promise<WorkspaceRepository> {
  let db: IDBPDatabase<CodefoldDB>;
  try {
    db = await openDB<CodefoldDB>(DB_NAME, DB_VERSION, {
      async upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          database.createObjectStore('workspace');
          database.createObjectStore('files', { keyPath: 'path' });
        }
        if (oldVersion < 2) {
          database.createObjectStore('zip');
          if (oldVersion < 1) return;
          // 버전 1 저장본을 나눈다. 같은 versionchange 트랜잭션이라 중간에 실패하면 모두 되돌아간다.
          const workspace = transaction.objectStore('workspace');
          const value: unknown = await workspace.get(CURRENT);
          if (value === undefined) return;
          const { meta, zip } = splitV1Record(value);
          await workspace.put(meta as WorkspaceMeta, CURRENT);
          if (zip) await transaction.objectStore('zip').put(zip, CURRENT);
        }
      },
    });
  } catch (error) {
    throw new StorageUnavailableError(error);
  }
  return createRepository(db);
}
