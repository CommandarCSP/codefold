import { view } from './bytes';
import { CorruptZipError, EncryptedZipError, NotZipError, SplitZipError, ZipError } from './errors';
import { decodeName, parseExtraFields } from './names';
import type { ByteSource, ZipEntry } from './types';

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_SIZE = 46;
const ZIP64_EXTRA = 0x0001;
const FLAG_ENCRYPTED = 0x1;
const FLAG_UTF8 = 0x800;
const DOS_HOSTS = new Set([0, 11, 14]); // MS-DOS, NTFS, VFAT

interface EndRecord {
  readonly disk: number;
  readonly centralDisk: number;
  readonly entriesOnDisk: number;
  readonly totalEntries: number;
  readonly centralSize: number;
  readonly centralOffset: number;
  /** EOCD(또는 ZIP64 EOCD)가 시작하는 위치. Central Directory는 이 앞에서 끝나야 한다. */
  readonly endOffset: number;
}

/**
 * 파일 끝의 EOCD와 Central Directory만 읽어 항목 목록을 만든다. 파일 데이터 영역은 읽지 않는다(ADR-0001).
 * @throws {NotZipError} EOCD가 없다.
 * @throws {SplitZipError} 여러 디스크로 나뉜 ZIP이다.
 * @throws {EncryptedZipError} 암호화된 항목이 있다.
 * @throws {CorruptZipError} 위치·서명·길이가 맞지 않는다.
 */
export async function readCentralDirectory(source: ByteSource): Promise<ZipEntry[]> {
  try {
    const end = await readEndRecord(source);
    if (end.disk !== 0 || end.centralDisk !== 0 || end.entriesOnDisk !== end.totalEntries) {
      throw new SplitZipError();
    }
    if (end.centralOffset + end.centralSize > end.endOffset) {
      throw new CorruptZipError('central directory가 파일 범위를 벗어났습니다');
    }
    const central = await source.read(end.centralOffset, end.centralOffset + end.centralSize);
    return parseEntries(central, end.totalEntries);
  } catch (error) {
    if (error instanceof ZipError) throw error;
    // DataView가 범위를 벗어나면 RangeError를 던진다. 끝이 잘린 구조라는 뜻이다.
    if (error instanceof RangeError) throw new CorruptZipError('구조가 중간에 끝났습니다');
    throw error;
  }
}

async function readEndRecord(source: ByteSource): Promise<EndRecord> {
  if (source.size < EOCD_SIZE) throw new NotZipError();
  const tailStart = Math.max(0, source.size - (EOCD_SIZE + MAX_COMMENT));
  const tail = await source.read(tailStart, source.size);
  const at = findEocd(tail);
  if (at < 0) throw new NotZipError();
  const v = view(tail);
  const eocdOffset = tailStart + at;
  const record: EndRecord = {
    disk: v.getUint16(at + 4, true),
    centralDisk: v.getUint16(at + 6, true),
    entriesOnDisk: v.getUint16(at + 8, true),
    totalEntries: v.getUint16(at + 10, true),
    centralSize: v.getUint32(at + 12, true),
    centralOffset: v.getUint32(at + 16, true),
    endOffset: eocdOffset,
  };
  const locatorAt = at - ZIP64_LOCATOR_SIZE;
  if (locatorAt >= 0 && v.getUint32(locatorAt, true) === ZIP64_LOCATOR_SIGNATURE) {
    const zip64Offset = toSafeNumber(v.getBigUint64(locatorAt + 8, true));
    return readZip64EndRecord(source, zip64Offset);
  }
  return record;
}

// 먼저 "EOCD 크기 + 주석 길이"가 파일 끝과 딱 맞는 서명을 뒤에서부터 찾는다. 주석 안의 가짜 서명에 속지 않는다.
// 그런 서명이 없으면(끝에 다른 바이트가 붙은 ZIP) 주석이 파일 안에 들어가는 가장 뒤의 서명을 받는다.
function findEocd(tail: Uint8Array): number {
  const v = view(tail);
  let lenient = -1;
  for (let i = tail.length - EOCD_SIZE; i >= 0; i -= 1) {
    if (v.getUint32(i, true) !== EOCD_SIGNATURE) continue;
    const end = i + EOCD_SIZE + v.getUint16(i + 20, true);
    if (end === tail.length) return i;
    if (lenient < 0 && end < tail.length) lenient = i;
  }
  return lenient;
}

async function readZip64EndRecord(source: ByteSource, offset: number): Promise<EndRecord> {
  const bytes = await source.read(offset, offset + 56);
  const v = view(bytes);
  if (v.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
    throw new CorruptZipError('ZIP64 EOCD 서명이 없습니다');
  }
  return {
    disk: v.getUint32(16, true),
    centralDisk: v.getUint32(20, true),
    entriesOnDisk: toSafeNumber(v.getBigUint64(24, true)),
    totalEntries: toSafeNumber(v.getBigUint64(32, true)),
    centralSize: toSafeNumber(v.getBigUint64(40, true)),
    centralOffset: toSafeNumber(v.getBigUint64(48, true)),
    endOffset: offset,
  };
}

function parseEntries(central: Uint8Array, total: number): ZipEntry[] {
  const v = view(central);
  const entries: ZipEntry[] = [];
  let offset = 0;
  // EOCD의 항목 수보다 Central Directory 크기를 믿는다. 항목 수를 65,536으로 나눈 나머지만 적는 도구가 있어서,
  // 항목 수에서 멈추면 나머지 항목이 목록과 다운로드에서 말없이 빠진다.
  let index = 0;
  for (; offset < central.length; index += 1) {
    if (central.length - offset < 4 || v.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      if (index >= total) break;
      throw new CorruptZipError(`${index}번째 항목의 서명이 없습니다`);
    }
    const versionMadeBy = v.getUint16(offset + 4, true);
    const flags = v.getUint16(offset + 8, true);
    if (flags & FLAG_ENCRYPTED) throw new EncryptedZipError();
    const nameLength = v.getUint16(offset + 28, true);
    const extraLength = v.getUint16(offset + 30, true);
    const commentLength = v.getUint16(offset + 32, true);
    const nameStart = offset + CENTRAL_SIZE;
    const extraStart = nameStart + nameLength;
    const next = extraStart + extraLength + commentLength;
    if (next > central.length) throw new CorruptZipError(`${index}번째 항목이 중간에 끝났습니다`);

    const extra = parseExtraFields(central.subarray(extraStart, extraStart + extraLength));
    let size = v.getUint32(offset + 24, true);
    let compressedSize = v.getUint32(offset + 20, true);
    let localHeaderOffset = v.getUint32(offset + 42, true);
    const zip64 = extra.get(ZIP64_EXTRA);
    if (zip64) {
      // ZIP64 확장 필드에는 원래 칸이 0xFFFFFFFF인 값만, 풀린 크기 → 압축 크기 → 로컬 헤더 위치 순서로 들어 있다.
      const z = view(zip64);
      let at = 0;
      const next64 = () => {
        const value = toSafeNumber(z.getBigUint64(at, true));
        at += 8;
        return value;
      };
      if (size === 0xffffffff) size = next64();
      if (compressedSize === 0xffffffff) compressedSize = next64();
      if (localHeaderOffset === 0xffffffff) localHeaderOffset = next64();
    }

    const decoded = decodeName(
      central.subarray(nameStart, extraStart),
      (flags & FLAG_UTF8) !== 0,
      extra,
    );
    const fromDos = DOS_HOSTS.has(versionMadeBy >> 8);
    const name = fromDos ? decoded.name.replaceAll('\\', '/') : decoded.name;
    const isDirectory = name.endsWith('/');
    const path = isDirectory ? name.slice(0, -1) : name;
    if (path !== '') {
      entries.push({
        index,
        path,
        isDirectory,
        size,
        compressedSize,
        method: v.getUint16(offset + 10, true),
        crc32: v.getUint32(offset + 16, true),
        flags,
        nameEncoding: decoded.encoding,
        localHeaderOffset,
        dosTime: v.getUint16(offset + 12, true),
        dosDate: v.getUint16(offset + 14, true),
        versionMadeBy,
        externalAttributes: v.getUint32(offset + 38, true),
      });
    }
    offset = next;
  }
  if (index < total)
    throw new CorruptZipError(`항목이 ${total}개라고 적혀 있지만 ${index}개뿐입니다`);
  return entries;
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new CorruptZipError('크기가 너무 큽니다');
  return Number(value);
}
