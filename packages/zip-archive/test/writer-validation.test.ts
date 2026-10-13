import { describe, expect, test } from 'vitest';
import { openZip } from '../src/archive';
import { blobSource } from '../src/bytes';
import { toDosDateTime } from '../src/dos-time';
import { InvalidZipItemError } from '../src/errors';
import { writeZip } from '../src/writer';

const file = (path: string) => ({ type: 'file' as const, path, data: new Uint8Array([1]) });

describe('DOS 날짜 범위', () => {
  test('2107년 뒤는 DOS 날짜로 쓸 수 있는 마지막 시각(2107-12-31 23:59:58)으로 맞춘다', () => {
    expect(toDosDateTime(new Date(2110, 0, 1))).toEqual(
      toDosDateTime(new Date(2107, 11, 31, 23, 59, 58)),
    );
  });
});

describe('쓸 수 없는 항목', () => {
  test('이름이 65,535바이트를 넘으면 InvalidZipItemError', async () => {
    await expect(writeZip([file('a'.repeat(65_536))])).rejects.toBeInstanceOf(InvalidZipItemError);
  });

  test('빈 경로, /로 끝나는 파일 경로는 InvalidZipItemError', async () => {
    for (const path of ['', 'a/']) {
      await expect(writeZip([file(path)])).rejects.toBeInstanceOf(InvalidZipItemError);
    }
    await expect(writeZip([{ type: 'directory', path: '' }])).rejects.toBeInstanceOf(
      InvalidZipItemError,
    );
  });

  test('원본 그대로 옮기는 이상한 경로(앞 /)는 막지 않는다', async () => {
    await expect(writeZip([file('/abs.txt')])).resolves.toBeInstanceOf(Blob);
  });

  test('폴더 경로 끝의 /는 한 번만 쓴다', async () => {
    const zip = await openZip(blobSource(await writeZip([{ type: 'directory', path: 'a/' }])));
    expect(zip.entries.map((entry) => entry.path)).toEqual(['a']);
  });
});
