import { describe, expect, test } from 'vitest';
import { blobSource, toByteSource } from '../src/bytes';
import { crc32 } from '../src/crc32';
import {
  CorruptZipError,
  EncryptedZipError,
  NotZipError,
  SplitZipError,
  UnsupportedCompressionError,
  ZipEntryNotFoundError,
  ZipError,
} from '../src/errors';

describe('crc32', () => {
  test('표준 확인값("123456789" → 0xCBF43926)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  test('빈 입력은 0', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
  test('나눠서 계산해도 같다', () => {
    const all = new TextEncoder().encode('hello, world');
    expect(crc32(all.subarray(5), crc32(all.subarray(0, 5)))).toBe(crc32(all));
  });
});

describe('blobSource', () => {
  test('요청한 범위만 돌려준다', async () => {
    const source = blobSource(new Blob([new Uint8Array([1, 2, 3, 4, 5])]));
    expect(source.size).toBe(5);
    expect([...(await source.read(1, 4))]).toEqual([2, 3, 4]);
    expect(source.slice(3, 5).size).toBe(2);
  });
  test('ByteSource는 그대로 쓴다', () => {
    const source = blobSource(new Blob([]));
    expect(toByteSource(source)).toBe(source);
  });
});

describe('오류 class', () => {
  test.each([
    [new NotZipError(), 'NotZipError'],
    [new CorruptZipError('끝이 잘림'), 'CorruptZipError'],
    [new EncryptedZipError(), 'EncryptedZipError'],
    [new SplitZipError(), 'SplitZipError'],
    [new UnsupportedCompressionError('a.txt', 12), 'UnsupportedCompressionError'],
    [new ZipEntryNotFoundError('a.txt'), 'ZipEntryNotFoundError'],
  ])('%s는 ZipError이고 이름으로 구분된다', (error, name) => {
    expect(error).toBeInstanceOf(ZipError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
  });
  test('지원하지 않는 압축 방식 오류는 경로와 방식 번호를 가진다', () => {
    expect(new UnsupportedCompressionError('a.txt', 12)).toMatchObject({
      path: 'a.txt',
      method: 12,
    });
  });
});
