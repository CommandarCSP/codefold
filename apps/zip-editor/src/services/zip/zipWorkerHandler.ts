import type { ExportPlan } from '@codefold/react-code-editor';
import type { FileSourceEntry } from '@codefold/virtual-fs';
import {
  openZip,
  writeZip,
  type ZipArchive,
  type ZipEntry,
  type ZipWriteItem,
} from '@codefold/zip-archive';
import {
  MissingExportDataError,
  serializeError,
  type ZipRequest,
  type ZipRequestBody,
  type ZipResponse,
  type ZipResult,
} from './zipProtocol';

export interface HandledResponse {
  readonly response: ZipResponse;
  readonly transfer: Transferable[];
}

export class ZipNotOpenError extends Error {
  override readonly name = 'ZipNotOpenError';
  constructor() {
    super('ZIP을 아직 열지 않았습니다');
  }
}

const toSourceEntry = (entry: ZipEntry): FileSourceEntry => ({
  path: entry.path,
  isDirectory: entry.isDirectory,
  size: entry.size,
});

/** 버퍼 전체를 차지하지 않는 조각은 사본으로 만든다. 조각째 transfer하면 버퍼 전체가 분리된다(ADR-0028). */
export function ownBuffer(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : bytes.slice();
}

async function exportZip(
  archive: ZipArchive,
  plan: ExportPlan,
  dirtyContents: Readonly<Record<string, Uint8Array<ArrayBuffer>>>,
): Promise<Blob> {
  // 같은 경로가 여러 번 나오면 뒤 항목이 이긴다(openZip과 같은 규칙).
  const files = new Map<string, ZipEntry>();
  for (const entry of archive.entries) if (!entry.isDirectory) files.set(entry.path, entry);
  const items: ZipWriteItem[] = [];
  for (const entry of plan.entries) {
    if (entry.type === 'copy') {
      items.push({ type: 'raw', path: entry.path, raw: await archive.readRaw(entry.originalPath) });
      continue;
    }
    if (entry.type === 'directory') {
      items.push({ type: 'directory', path: entry.path });
      continue;
    }
    const data = dirtyContents[entry.path];
    if (!data) throw new MissingExportDataError(entry.path);
    const original = entry.originalPath === undefined ? undefined : files.get(entry.originalPath);
    items.push({
      type: 'file',
      path: entry.path,
      data,
      ...(original ? { attributesFrom: original } : {}),
    });
  }
  return writeZip(items);
}

/** Worker 안의 처리기. 스레드를 모르므로 Worker 없이 테스트한다. 연 ZIP은 처리기가 쥔다. */
export function createZipWorkerHandler(): (request: ZipRequest) => Promise<HandledResponse> {
  let archive: ZipArchive | undefined;
  const opened = (): ZipArchive => {
    if (!archive) throw new ZipNotOpenError();
    return archive;
  };
  const run = async (body: ZipRequestBody): Promise<ZipResult> => {
    switch (body.type) {
      case 'open':
        archive = await openZip(body.blob);
        return { type: 'open', entries: archive.entries.map(toSourceEntry) };
      case 'readHead':
        return { type: 'bytes', bytes: ownBuffer(await opened().readHead(body.path, body.bytes)) };
      case 'readAll':
        return { type: 'bytes', bytes: ownBuffer(await opened().readAll(body.path)) };
      case 'export':
        return { type: 'export', blob: await exportZip(opened(), body.plan, body.dirtyContents) };
    }
  };
  return async (request) => {
    try {
      const result = await run(request);
      return {
        response: { id: request.id, ok: true, result },
        transfer: result.type === 'bytes' ? [result.bytes.buffer] : [],
      };
    } catch (error) {
      return {
        response: { id: request.id, ok: false, error: serializeError(error) },
        transfer: [],
      };
    }
  };
}

/**
 * 응답을 보낸다. 보내다 던지면(DataCloneError, 분리된 버퍼 등) 같은 id로 실패 응답을 보낸다.
 * 보내지 못한 채 두면 메인 스레드는 그 요청을 끝없이 기다린다(다운로드가 "ZIP 만드는 중"에 멈춤).
 */
export function postHandled(
  { response, transfer }: HandledResponse,
  post: (message: ZipResponse, transfer: Transferable[]) => void,
): void {
  try {
    post(response, transfer);
  } catch (error) {
    post({ id: response.id, ok: false, error: serializeError(error) }, []);
  }
}
