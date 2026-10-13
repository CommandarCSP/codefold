import type { ExportPlan } from '@codefold/react-code-editor';
import type { FileSourceEntry } from '@codefold/virtual-fs';
import {
  CorruptZipError,
  EncryptedZipError,
  InvalidZipItemError,
  NotZipError,
  SplitZipError,
  UnsupportedCompressionError,
  ZipEntryNotFoundError,
} from '@codefold/zip-archive';

/**
 * 메인 스레드와 ZIP Worker 사이의 메시지(ADR-0028). 형식은 이 파일 한 곳에 둔다.
 * 모두 structured clone으로 넘어가는 순수 데이터다(ADR-0017).
 */
export type ZipRequestBody =
  | { readonly type: 'open'; readonly blob: Blob }
  | { readonly type: 'readHead'; readonly path: string; readonly bytes: number }
  | { readonly type: 'readAll'; readonly path: string }
  | {
      readonly type: 'export';
      readonly plan: ExportPlan;
      readonly dirtyContents: Readonly<Record<string, Uint8Array<ArrayBuffer>>>;
    };

export type ZipRequest = ZipRequestBody & { readonly id: number };

export type ZipResult =
  | { readonly type: 'open'; readonly entries: readonly FileSourceEntry[] }
  | { readonly type: 'bytes'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly type: 'export'; readonly blob: Blob };

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly path?: string;
  readonly method?: number;
}

export type ZipResponse =
  | { readonly id: number; readonly ok: true; readonly result: ZipResult }
  | { readonly id: number; readonly ok: false; readonly error: SerializedError };

/** Worker가 던졌지만 zip-archive 오류가 아닌 것. 이름과 문구를 그대로 가진다. */
export class ZipWorkerError extends Error {
  override readonly name: string;
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

/** 내보내기 계획의 "새 내용" 항목에 보낼 바이트가 없다. Worker가 던지고 메인 스레드가 이유로 보인다. */
export class MissingExportDataError extends Error {
  override readonly name = 'MissingExportDataError';
  readonly path: string;
  constructor(path: string) {
    super(`새로 쓸 내용이 없습니다: ${path}`);
    this.path = path;
  }
}

export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) return { name: 'Error', message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...('path' in error && typeof error.path === 'string' ? { path: error.path } : {}),
    ...('method' in error && typeof error.method === 'number' ? { method: error.method } : {}),
  };
}

const rebuild: Readonly<Record<string, (error: SerializedError) => Error>> = {
  NotZipError: () => new NotZipError(),
  CorruptZipError: () => new CorruptZipError(''),
  EncryptedZipError: () => new EncryptedZipError(),
  SplitZipError: () => new SplitZipError(),
  UnsupportedCompressionError: (error) =>
    new UnsupportedCompressionError(error.path ?? '', error.method ?? -1),
  ZipEntryNotFoundError: (error) => new ZipEntryNotFoundError(error.path ?? ''),
  InvalidZipItemError: (error) => new InvalidZipItemError(error.path ?? '', ''),
  MissingExportDataError: (error) => new MissingExportDataError(error.path ?? ''),
};

/** zip-archive 오류와 내보내기 오류는 같은 class로 다시 만들어 `instanceof`로 구분할 수 있게 한다. */
export function deserializeError(error: SerializedError): Error {
  const build = Object.hasOwn(rebuild, error.name) ? rebuild[error.name] : undefined;
  const result = build ? build(error) : new ZipWorkerError(error.name, error.message);
  result.message = error.message;
  return result;
}

/** 넘길 바이트의 버퍼. 같은 버퍼는 한 번만 담는다. */
export function transferablesOf(
  contents: Readonly<Record<string, Uint8Array<ArrayBuffer>>>,
): ArrayBuffer[] {
  return [...new Set(Object.values(contents).map((bytes) => bytes.buffer))];
}
