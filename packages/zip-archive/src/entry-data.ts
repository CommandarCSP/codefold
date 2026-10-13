import { view } from './bytes';
import { crc32 } from './crc32';
import { CorruptZipError, UnsupportedCompressionError, ZipError } from './errors';
import type { ByteSource, RawZipEntry, ZipEntry } from './types';

const LOCAL_SIGNATURE = 0x04034b50;
const LOCAL_SIZE = 30;

// 로컬 헤더의 이름·확장 필드 길이는 Central Directory와 다를 수 있어 로컬 헤더에서 읽는다.
// 압축 크기는 데이터 기술자를 쓴 항목에서 로컬 헤더에 0으로 적히므로 Central Directory 값을 쓴다.
async function dataRange(source: ByteSource, entry: ZipEntry): Promise<[number, number]> {
  const header = await source.read(entry.localHeaderOffset, entry.localHeaderOffset + LOCAL_SIZE);
  if (header.length < LOCAL_SIZE || view(header).getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw new CorruptZipError(`${entry.path}: 로컬 헤더가 없습니다`);
  }
  const v = view(header);
  const start =
    entry.localHeaderOffset + LOCAL_SIZE + v.getUint16(26, true) + v.getUint16(28, true);
  const end = start + entry.compressedSize;
  if (end > source.size)
    throw new CorruptZipError(`${entry.path}: 데이터가 파일 범위를 벗어났습니다`);
  return [start, end];
}

function assertSupported(entry: ZipEntry): void {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new UnsupportedCompressionError(entry.path, entry.method);
  }
}

function inflate(blob: Blob): ReadableStream<Uint8Array> {
  return blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
}

function corrupt(entry: ZipEntry, error: unknown): ZipError {
  return error instanceof ZipError
    ? error
    : new CorruptZipError(`${entry.path}: 압축을 풀 수 없습니다`);
}

/** 파일의 앞 `bytes`바이트만 풀어 돌려준다. Deflate도 필요한 만큼만 풀고 멈춘다. */
export async function readHead(
  source: ByteSource,
  entry: ZipEntry,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  assertSupported(entry);
  const wanted = Math.min(bytes, entry.size);
  if (wanted <= 0) return new Uint8Array();
  const [start, end] = await dataRange(source, entry);
  if (entry.method === 0) return source.read(start, Math.min(end, start + wanted));

  const reader = inflate(source.slice(start, end)).getReader();
  const out = new Uint8Array(wanted);
  let filled = 0;
  try {
    while (filled < wanted) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, wanted - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  } catch (error) {
    throw corrupt(entry, error);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return filled === wanted ? out : out.slice(0, filled);
}

/** 파일 전체를 풀고 크기와 CRC를 확인한다. 기록된 크기보다 더 풀리면 멈춘다. */
// Deflate의 최대 압축률은 약 1032:1이다. 선언된 크기가 이보다 크면 헤더가 거짓이므로,
// 그 크기만큼 메모리를 잡기 전에 거절한다.
const MAX_DEFLATE_RATIO = 1032;

function assertPlausibleSize(entry: ZipEntry): void {
  const limit =
    entry.method === 0 ? entry.compressedSize : entry.compressedSize * MAX_DEFLATE_RATIO + 1024;
  const plausible = entry.method === 0 ? entry.size === limit : entry.size <= limit;
  if (!plausible)
    throw new CorruptZipError(`${entry.path}: 기록된 크기가 압축 크기와 맞지 않습니다`);
}

export async function readAll(
  source: ByteSource,
  entry: ZipEntry,
): Promise<Uint8Array<ArrayBuffer>> {
  assertSupported(entry);
  assertPlausibleSize(entry);
  const [start, end] = await dataRange(source, entry);
  const data =
    entry.method === 0
      ? await source.read(start, end)
      : await inflateAll(source.slice(start, end), entry);
  if (data.length !== entry.size)
    throw new CorruptZipError(`${entry.path}: 크기가 기록과 다릅니다`);
  if (crc32(data) !== entry.crc32) throw new CorruptZipError(`${entry.path}: CRC가 맞지 않습니다`);
  return data;
}

async function inflateAll(blob: Blob, entry: ZipEntry): Promise<Uint8Array<ArrayBuffer>> {
  const reader = inflate(blob).getReader();
  const out = new Uint8Array(entry.size);
  let filled = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (filled + value.length > out.length) {
        throw new CorruptZipError(`${entry.path}: 기록된 크기보다 더 풀립니다`);
      }
      out.set(value, filled);
      filled += value.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw corrupt(entry, error);
  }
  return filled === out.length ? out : out.slice(0, filled);
}

/** 원본 압축 바이트를 `Blob` 조각으로 돌려준다. 메모리로 복사하지 않는다. */
export async function readRaw(source: ByteSource, entry: ZipEntry): Promise<RawZipEntry> {
  const [start, end] = await dataRange(source, entry);
  return { entry, data: source.slice(start, end) };
}
