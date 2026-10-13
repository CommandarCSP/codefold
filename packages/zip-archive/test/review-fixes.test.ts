import { describe, expect, test } from 'vitest';
import { openZip } from '../src/archive';
import { readAll } from '../src/entry-data';
import { CorruptZipError, ZipError } from '../src/errors';
import { writeZip } from '../src/writer';
import { fixture, fixtureBytes, recordingSource } from './helpers';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('선언된 크기가 부풀려진 항목', () => {
  test('Deflate 최대 압축률로도 나올 수 없는 크기면 풀기 전에 CorruptZipError', async () => {
    const zip = await openZip(fixture('deflate.zip'));
    const entry = zip.entries.find((e) => e.path === 'project/data/repeat.txt')!;
    const { source, ranges } = recordingSource(fixture('deflate.zip'));
    const error = await readAll(source, { ...entry, size: 2 ** 52 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CorruptZipError);
    expect(ranges).toEqual([]);
  });

  test('Stored인데 크기와 압축 크기가 다르면 읽기 전에 CorruptZipError', async () => {
    const zip = await openZip(fixture('stored.zip'));
    const entry = zip.entries.find((e) => e.path === 'project/src/main.py')!;
    const { source, ranges } = recordingSource(fixture('stored.zip'));
    const error = await readAll(source, { ...entry, size: entry.size + 1 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ZipError);
    expect(ranges).toEqual([]);
  });
});

describe('원본 속성 이어받기', () => {
  test('Windows에서 만든 항목의 속성은 호스트 바이트와 함께 넘어간다', async () => {
    const dos = { externalAttributes: 0x20, versionMadeBy: 0x0014 };
    const out = await openZip(
      await writeZip([{ type: 'file', path: 'win.txt', data: utf8('x'), attributesFrom: dos }]),
    );
    expect(out.entries[0]).toMatchObject(dos);
  });
});

describe('EOCD의 항목 수가 실제보다 작은 ZIP', () => {
  test('Central Directory에 남은 항목도 모두 읽는다 (항목 수를 65,536으로 나눈 나머지만 적는 도구)', async () => {
    const bytes = fixtureBytes('deflate.zip');
    const expected = (await openZip(new Blob([bytes]))).entries.length;
    const v = new DataView(bytes.buffer);
    v.setUint16(bytes.length - 22 + 8, 2, true);
    v.setUint16(bytes.length - 22 + 10, 2, true);
    expect((await openZip(new Blob([bytes]))).entries.length).toBe(expected);
  });

  test('항목 수보다 적게 들어 있으면 CorruptZipError', async () => {
    const bytes = fixtureBytes('deflate.zip');
    const v = new DataView(bytes.buffer);
    v.setUint16(bytes.length - 22 + 8, 500, true);
    v.setUint16(bytes.length - 22 + 10, 500, true);
    await expect(openZip(new Blob([bytes]))).rejects.toBeInstanceOf(CorruptZipError);
  });
});
