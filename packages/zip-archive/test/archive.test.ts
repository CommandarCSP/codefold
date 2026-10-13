import { describe, expect, test } from 'vitest';
import { openZip } from '../src/archive';
import { CorruptZipError, UnsupportedCompressionError, ZipEntryNotFoundError } from '../src/errors';
import { centralRecordAt, fixture, fixtureBytes, recordingSource } from './helpers';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const REPEAT = 'hello\n'.repeat(200);

describe('openZip', () => {
  test('Stored·Deflate 파일 전체를 읽는다', async () => {
    for (const name of ['stored.zip', 'deflate.zip', 'zip64-small.zip', 'no-dir-entries.zip']) {
      const zip = await openZip(fixture(name));
      expect(text(await zip.readAll('project/src/main.py'))).toBe('print("hello")\n');
      expect(text(await zip.readAll('project/data/repeat.txt'))).toBe(REPEAT);
    }
  });

  test('앞부분만 읽는다 (Deflate도 필요한 만큼만 푼다)', async () => {
    for (const name of ['stored.zip', 'deflate.zip']) {
      const zip = await openZip(fixture(name));
      expect(text(await zip.readHead('project/data/repeat.txt', 12))).toBe('hello\nhello\n');
      expect((await zip.readHead('project/src/main.py', 8192)).length).toBe(15);
    }
  });

  test('데이터 기술자를 쓴 항목(macOS ditto)을 읽는다', async () => {
    const zip = await openZip(fixture('macos-ditto.zip'));
    expect(text(await zip.readAll('finder/한글폴더/노트.txt'))).toBe('안녕\n');
  });

  test('파일 하나를 읽으면 그 파일의 범위만 읽는다', async () => {
    const zip = await openZip(fixture('deflate.zip'));
    const target = zip.entries.find((e) => e.path === 'project/data/repeat.txt')!;
    const { source, ranges } = recordingSource(fixture('deflate.zip'));
    const recorded = await openZip(source);
    ranges.length = 0;
    await recorded.readAll('project/data/repeat.txt');
    const others = zip.entries.filter((e) => e.localHeaderOffset > target.localHeaderOffset);
    const nextStart = Math.min(...others.map((e) => e.localHeaderOffset), source.size);
    expect(
      ranges.every(([start, end]) => start >= target.localHeaderOffset && end <= nextStart),
    ).toBe(true);
  });

  test('없는 경로와 폴더는 ZipEntryNotFoundError', async () => {
    const zip = await openZip(fixture('deflate.zip'));
    await expect(zip.readAll('nope.txt')).rejects.toBeInstanceOf(ZipEntryNotFoundError);
    await expect(zip.readAll('project/src')).rejects.toBeInstanceOf(ZipEntryNotFoundError);
  });

  test('지원하지 않는 압축 방식은 목록에 나오고, 읽으면 UnsupportedCompressionError', async () => {
    const zip = await openZip(fixture('bzip2.zip'));
    expect(zip.entries.map((e) => e.path)).toEqual(['a.txt']);
    await expect(zip.readAll('a.txt')).rejects.toMatchObject({
      name: 'UnsupportedCompressionError',
      method: 12,
    });
    await expect(zip.readHead('a.txt', 10)).rejects.toBeInstanceOf(UnsupportedCompressionError);
  });

  test('데이터가 깨지면 CRC 검사로 CorruptZipError', async () => {
    const bytes = fixtureBytes('stored.zip');
    const zip = await openZip(new Blob([bytes]));
    const entry = zip.entries.find((e) => e.path === 'project/src/main.py')!;
    const v = new DataView(bytes.buffer);
    const at =
      entry.localHeaderOffset +
      30 +
      v.getUint16(entry.localHeaderOffset + 26, true) +
      v.getUint16(entry.localHeaderOffset + 28, true);
    bytes[at] = bytes[at]! ^ 0xff; // Stored 데이터 첫 바이트를 뒤집는다
    const broken = await openZip(new Blob([bytes]));
    await expect(broken.readAll('project/src/main.py')).rejects.toBeInstanceOf(CorruptZipError);
  });

  test('기록된 크기보다 더 풀리면 멈추고 CorruptZipError (압축 폭탄 방어)', async () => {
    const bytes = fixtureBytes('deflate.zip');
    const record = centralRecordAt(bytes, 'project/data/repeat.txt');
    new DataView(bytes.buffer).setUint32(record + 24, 10, true); // 풀린 크기 1200을 10으로 속인다
    const lying = await openZip(new Blob([bytes]));
    expect(lying.entries.find((e) => e.path === 'project/data/repeat.txt')?.size).toBe(10);
    await expect(lying.readAll('project/data/repeat.txt')).rejects.toBeInstanceOf(CorruptZipError);
  });

  test('기록된 크기보다 덜 풀리면 CorruptZipError', async () => {
    const bytes = fixtureBytes('deflate.zip');
    const record = centralRecordAt(bytes, 'project/data/repeat.txt');
    new DataView(bytes.buffer).setUint32(record + 24, 5000, true);
    const lying = await openZip(new Blob([bytes]));
    await expect(lying.readAll('project/data/repeat.txt')).rejects.toBeInstanceOf(CorruptZipError);
  });

  test('readRaw는 로컬 헤더를 뺀 압축 데이터를 돌려준다', async () => {
    const zip = await openZip(fixture('deflate.zip'));
    const raw = await zip.readRaw('project/data/repeat.txt');
    expect(raw.data.size).toBe(raw.entry.compressedSize);
    expect(raw.entry.method).toBe(8);
  });
});
