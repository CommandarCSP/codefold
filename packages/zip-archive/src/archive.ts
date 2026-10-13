import { toByteSource } from './bytes';
import { readCentralDirectory } from './central';
import { readAll, readHead, readRaw } from './entry-data';
import { ZipEntryNotFoundError } from './errors';
import type { ByteSource, RawZipEntry, ZipEntry } from './types';

/**
 * 연 ZIP. `virtual-fs`의 `FileSource`(`list`, `readHead`, `readAll`)와 모양이 같아 그대로 넘길 수 있다(ADR-0016).
 */
export interface ZipArchive {
  /** Central Directory 순서의 모든 항목. 같은 경로가 여러 번 나오면 모두 들어 있다. */
  readonly entries: readonly ZipEntry[];
  list(): Promise<readonly ZipEntry[]>;
  /** 파일의 앞부분만 푼다. 파일 종류 판단용이다. */
  readHead(path: string, bytes: number): Promise<Uint8Array<ArrayBuffer>>;
  /** 파일 전체를 풀고 CRC를 확인한다. */
  readAll(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /** 원본 압축 바이트. 다운로드할 때 다시 압축하지 않고 옮긴다. */
  readRaw(path: string): Promise<RawZipEntry>;
}

/**
 * ZIP을 연다. 파일 끝과 Central Directory만 읽으므로 파일 수가 많아도 데이터 크기와 상관없이 빠르다.
 * ZIP인지는 확장자가 아니라 내용(EOCD)으로 판단한다.
 */
export async function openZip(input: Blob | ByteSource): Promise<ZipArchive> {
  const source = toByteSource(input);
  const entries = await readCentralDirectory(source);
  const files = new Map<string, ZipEntry>();
  // 같은 경로가 두 번 나오면 뒤 항목이 이긴다. 대부분의 압축 해제 도구가 뒤 항목으로 덮어쓴다.
  for (const entry of entries) if (!entry.isDirectory) files.set(entry.path, entry);
  const find = (path: string): ZipEntry => {
    const entry = files.get(path);
    if (!entry) throw new ZipEntryNotFoundError(path);
    return entry;
  };
  return {
    entries,
    list: async () => entries,
    readHead: async (path, bytes) => readHead(source, find(path), bytes),
    readAll: async (path) => readAll(source, find(path)),
    readRaw: async (path) => readRaw(source, find(path)),
  };
}
