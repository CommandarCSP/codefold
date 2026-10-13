import { crc32 } from './crc32';
import { toDosDateTime } from './dos-time';
import { InvalidZipItemError } from './errors';
import type { ZipWriteItem } from './types';

const FLAG_UTF8 = 0x800;
// raw 항목에서 이어받는 플래그: Deflate 압축 옵션(bit 1, 2)만. 데이터 기술자(bit 3)는 쓰지 않으므로 뺀다.
const RAW_FLAG_MASK = 0x0006;
const VERSION_MADE_BY_UNIX = (3 << 8) | 45;
const FILE_ATTRIBUTES = (0o100644 << 16) >>> 0;
const DIRECTORY_ATTRIBUTES = ((0o040755 << 16) | 0x10) >>> 0;
const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;
const ZIP64_VERSION = 45;

/** 헤더를 쓰는 데 필요한 값. 테스트에서 큰 값을 직접 넣으려고 내보낸다(`index.ts`에서는 내보내지 않는다). */
export interface EntryRecord {
  readonly name: Uint8Array;
  readonly flags: number;
  readonly method: number;
  readonly time: number;
  readonly date: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly versionMadeBy: number;
  readonly externalAttributes: number;
  readonly data: Blob | Uint8Array<ArrayBuffer>;
}

/**
 * 항목 목록으로 새 ZIP을 만든다.
 *
 * `raw` 항목은 원본 압축 바이트(`Blob` 조각)를 그대로 옮기고, `file` 항목만 새로 압축한다.
 * 결과 `Blob`은 부품을 이어 붙인 것이라 원본 바이트를 메모리로 복사하지 않는다.
 * 이름은 UTF-8로 쓰고 UTF-8 플래그를 켠다.
 * @throws {InvalidZipItemError} 빈 경로, `/`로 끝나는 파일 경로, 65,535바이트를 넘는 이름이 있다.
 */
export async function writeZip(items: readonly ZipWriteItem[]): Promise<Blob> {
  // 압축을 시작하기 전에 모든 이름을 먼저 확인한다.
  for (const item of items) encodeName(item);
  const parts: (Blob | Uint8Array<ArrayBuffer>)[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const item of items) {
    const record = await toRecord(item);
    const local = localHeader(record, offset);
    parts.push(local, record.data);
    central.push(centralHeader(record, offset));
    offset += local.length + record.compressedSize;
  }
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  parts.push(...central, endRecords(items.length, centralSize, offset));
  return new Blob(parts, { type: 'application/zip' });
}

/** ZIP에 쓸 이름. 폴더는 끝에 `/`를 한 번만 붙인다. 쓸 수 없는 경로면 던진다. */
function encodeName(item: ZipWriteItem): Uint8Array {
  const path = item.type === 'directory' ? item.path.replace(/\/+$/, '') : item.path;
  // 이상한 원본 경로(앞 `/`, `..` 등)는 원본 그대로 내보내는 항목이라 막지 않는다. 다시 열면 사라지거나
  // 폴더로 보일 경로만 막는다.
  if (path === '') throw new InvalidZipItemError(item.path, '빈 경로');
  if (item.type !== 'directory' && path.endsWith('/')) {
    throw new InvalidZipItemError(item.path, '/로 끝나는 파일 경로');
  }
  const name = new TextEncoder().encode(item.type === 'directory' ? `${path}/` : path);
  // 이름 길이 칸은 2바이트다. 넘으면 길이가 잘려 ZIP이 깨진다.
  if (name.length > MAX_16) throw new InvalidZipItemError(item.path, '65,535바이트를 넘는 이름');
  return name;
}

async function toRecord(item: ZipWriteItem): Promise<EntryRecord> {
  const name = encodeName(item);
  if (item.type === 'raw') {
    const { entry, data } = item.raw;
    return {
      name,
      flags: (entry.flags & RAW_FLAG_MASK) | FLAG_UTF8,
      method: entry.method,
      time: entry.dosTime,
      date: entry.dosDate,
      crc: entry.crc32,
      compressedSize: entry.compressedSize,
      size: entry.size,
      versionMadeBy: entry.versionMadeBy,
      externalAttributes: entry.externalAttributes,
      data,
    };
  }
  const { time, date } = toDosDateTime(item.modified ?? new Date());
  if (item.type === 'directory') {
    return {
      name,
      flags: FLAG_UTF8,
      method: 0,
      time,
      date,
      crc: 0,
      compressedSize: 0,
      size: 0,
      versionMadeBy: VERSION_MADE_BY_UNIX,
      externalAttributes: DIRECTORY_ATTRIBUTES,
      data: new Uint8Array(),
    };
  }
  const compressed = item.data.length > 0 ? await deflate(item.data) : item.data;
  // 이미 압축된 데이터처럼 줄지 않으면 Stored로 쓴다.
  const stored = compressed.length >= item.data.length;
  return {
    name,
    flags: FLAG_UTF8,
    method: stored ? 0 : 8,
    time,
    date,
    crc: crc32(item.data),
    compressedSize: stored ? item.data.length : compressed.length,
    size: item.data.length,
    versionMadeBy: item.attributesFrom?.versionMadeBy ?? VERSION_MADE_BY_UNIX,
    externalAttributes: item.attributesFrom?.externalAttributes ?? FILE_ATTRIBUTES,
    data: stored ? item.data : compressed,
  };
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function needsZip64(r: EntryRecord, localOffset: number): boolean {
  return r.size >= MAX_32 || r.compressedSize >= MAX_32 || localOffset >= MAX_32;
}

function versionNeeded(method: number, zip64: boolean): number {
  if (zip64) return ZIP64_VERSION;
  return method === 8 ? 20 : 10;
}

// 로컬 헤더에는 두 크기가 모두 들어간다(APPNOTE 4.5.3).
function localHeader(r: EntryRecord, localOffset: number): Uint8Array<ArrayBuffer> {
  const zip64 = needsZip64(r, localOffset);
  const extraLength = zip64 ? 20 : 0;
  const out = new Uint8Array(30 + r.name.length + extraLength);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, versionNeeded(r.method, zip64), true);
  v.setUint16(6, r.flags, true);
  v.setUint16(8, r.method, true);
  v.setUint16(10, r.time, true);
  v.setUint16(12, r.date, true);
  v.setUint32(14, r.crc, true);
  v.setUint32(18, zip64 ? MAX_32 : r.compressedSize, true);
  v.setUint32(22, zip64 ? MAX_32 : r.size, true);
  v.setUint16(26, r.name.length, true);
  v.setUint16(28, extraLength, true);
  out.set(r.name, 30);
  if (zip64) {
    const at = 30 + r.name.length;
    v.setUint16(at, 0x0001, true);
    v.setUint16(at + 2, 16, true);
    v.setBigUint64(at + 4, BigInt(r.size), true);
    v.setBigUint64(at + 12, BigInt(r.compressedSize), true);
  }
  return out;
}

// Central Directory 확장 필드에는 원래 칸이 넘친 값만, 풀린 크기 → 압축 크기 → 위치 순서로 넣는다.
export function centralHeader(r: EntryRecord, localOffset: number): Uint8Array<ArrayBuffer> {
  const values: bigint[] = [];
  if (r.size >= MAX_32) values.push(BigInt(r.size));
  if (r.compressedSize >= MAX_32) values.push(BigInt(r.compressedSize));
  if (localOffset >= MAX_32) values.push(BigInt(localOffset));
  const extraLength = values.length > 0 ? 4 + values.length * 8 : 0;
  const out = new Uint8Array(46 + r.name.length + extraLength);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x02014b50, true);
  v.setUint16(4, r.versionMadeBy, true);
  v.setUint16(6, versionNeeded(r.method, values.length > 0), true);
  v.setUint16(8, r.flags, true);
  v.setUint16(10, r.method, true);
  v.setUint16(12, r.time, true);
  v.setUint16(14, r.date, true);
  v.setUint32(16, r.crc, true);
  v.setUint32(20, Math.min(r.compressedSize, MAX_32), true);
  v.setUint32(24, Math.min(r.size, MAX_32), true);
  v.setUint16(28, r.name.length, true);
  v.setUint16(30, extraLength, true);
  v.setUint32(38, r.externalAttributes, true);
  v.setUint32(42, Math.min(localOffset, MAX_32), true);
  out.set(r.name, 46);
  if (values.length > 0) {
    const at = 46 + r.name.length;
    v.setUint16(at, 0x0001, true);
    v.setUint16(at + 2, values.length * 8, true);
    values.forEach((value, i) => v.setBigUint64(at + 4 + i * 8, value, true));
  }
  return out;
}

function endRecords(
  count: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array<ArrayBuffer> {
  const zip64 = count > MAX_16 || centralSize >= MAX_32 || centralOffset >= MAX_32;
  const eocd = new Uint8Array(22);
  const e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, Math.min(count, MAX_16), true);
  e.setUint16(10, Math.min(count, MAX_16), true);
  e.setUint32(12, Math.min(centralSize, MAX_32), true);
  e.setUint32(16, Math.min(centralOffset, MAX_32), true);
  if (!zip64) return eocd;

  const record = new Uint8Array(56);
  const r = new DataView(record.buffer);
  r.setUint32(0, 0x06064b50, true);
  r.setBigUint64(4, 44n, true); // 이 필드 뒤의 레코드 크기
  r.setUint16(12, (3 << 8) | ZIP64_VERSION, true);
  r.setUint16(14, ZIP64_VERSION, true);
  r.setBigUint64(24, BigInt(count), true);
  r.setBigUint64(32, BigInt(count), true);
  r.setBigUint64(40, BigInt(centralSize), true);
  r.setBigUint64(48, BigInt(centralOffset), true);

  const locator = new Uint8Array(20);
  const l = new DataView(locator.buffer);
  l.setUint32(0, 0x07064b50, true);
  l.setBigUint64(8, BigInt(centralOffset + centralSize), true);
  l.setUint32(16, 1, true);

  const out = new Uint8Array(56 + 20 + 22);
  out.set(record, 0);
  out.set(locator, 56);
  out.set(eocd, 76);
  return out;
}
