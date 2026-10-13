import type { ExportRequest } from '@codefold/react-code-editor';
import type { FileSource, FileSourceEntry } from '@codefold/virtual-fs';
import {
  deserializeError,
  transferablesOf,
  type ZipRequest,
  type ZipRequestBody,
  type ZipResponse,
  type ZipResult,
} from './zipProtocol';

/** Worker와 이야기하는 통로. 실제는 createZipWorker, 테스트는 같은 처리기를 부르는 가짜 포트다. */
export interface ZipPort {
  postMessage(message: ZipRequest, transfer: Transferable[]): void;
  onMessage(listener: (response: ZipResponse) => void): void;
  onCrash(listener: (error: Error) => void): void;
  terminate(): void;
}

/** ZIP Worker를 부르는 메인 스레드 대리 객체(ADR-0028). `<CodeEditor source>`에 그대로 넘긴다. */
export interface ZipSource extends FileSource {
  readHead(path: string, bytes: number): Promise<Uint8Array<ArrayBuffer>>;
  readAll(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Worker가 결과 ZIP을 만든다. `dirtyContents`의 버퍼는 transfer되어 이 뒤로 쓸 수 없다. */
  exportZip(request: ExportRequest): Promise<Blob>;
  /** Worker를 끝낸다. 기다리던 요청과 뒤의 요청은 ZipSourceDisposedError로 끝난다. */
  dispose(): void;
}

export class ZipWorkerCrashedError extends Error {
  override readonly name = 'ZipWorkerCrashedError';
}

export class ZipSourceDisposedError extends Error {
  override readonly name = 'ZipSourceDisposedError';
  constructor() {
    super('ZIP 작업을 이미 끝냈습니다');
  }
}

export class UnexpectedZipResultError extends Error {
  override readonly name = 'UnexpectedZipResultError';
  constructor(expected: string, actual: string) {
    super(`ZIP Worker 응답이 ${expected}가 아니라 ${actual}입니다`);
  }
}

type ResultOf<T extends ZipResult['type']> = Extract<ZipResult, { readonly type: T }>;

function pick<T extends ZipResult['type']>(type: T, result: ZipResult): ResultOf<T> {
  if (result.type !== type) throw new UnexpectedZipResultError(type, result.type);
  return result as ResultOf<T>;
}

/** Worker에서 ZIP 목록을 읽고 대리 객체를 돌려준다. 실패하면 Worker를 끝내고 zip-archive 오류를 던진다. */
export async function openZipInWorker(blob: Blob, createPort: () => ZipPort): Promise<ZipSource> {
  const port = createPort();
  const pending = new Map<
    number,
    { resolve: (result: ZipResult) => void; reject: (error: unknown) => void }
  >();
  let nextId = 0;
  let closed: Error | undefined;
  const close = (error: Error) => {
    closed ??= error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    port.terminate();
  };
  port.onMessage((response) => {
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.result);
    else request.reject(deserializeError(response.error));
  });
  port.onCrash(close);
  const call = (body: ZipRequestBody, transfer: Transferable[] = []) =>
    new Promise<ZipResult>((resolve, reject) => {
      if (closed) {
        reject(closed);
        return;
      }
      nextId += 1;
      const id = nextId;
      pending.set(id, { resolve, reject });
      try {
        port.postMessage({ ...body, id }, transfer);
      } catch (error) {
        // 보내지 못한 요청은 응답이 오지 않는다. 기다리는 목록에서 빼고 곧바로 실패로 끝낸다.
        pending.delete(id);
        reject(error);
      }
    });

  let entries: readonly FileSourceEntry[];
  try {
    entries = pick('open', await call({ type: 'open', blob })).entries;
  } catch (error) {
    close(new ZipSourceDisposedError());
    throw error;
  }
  return {
    list: async () => entries,
    readHead: async (path, bytes) =>
      pick('bytes', await call({ type: 'readHead', path, bytes })).bytes,
    readAll: async (path) => pick('bytes', await call({ type: 'readAll', path })).bytes,
    exportZip: async ({ plan, dirtyContents }) =>
      pick(
        'export',
        await call({ type: 'export', plan, dirtyContents }, transferablesOf(dirtyContents)),
      ).blob,
    dispose: () => close(new ZipSourceDisposedError()),
  };
}
