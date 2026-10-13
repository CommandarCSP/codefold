import {
  CorruptZipError,
  EncryptedZipError,
  InvalidZipItemError,
  NotZipError,
  SplitZipError,
  UnsupportedCompressionError,
  ZipEntryNotFoundError,
} from '@codefold/zip-archive';
import { describe, expect, test } from 'vitest';
import {
  deserializeError,
  MissingExportDataError,
  serializeError,
  transferablesOf,
  ZipWorkerError,
} from '../zipProtocol';

const roundTrip = (error: unknown) => deserializeError(serializeError(error));

describe('ZIP Worker 메시지 (ADR-0028)', () => {
  test('zip-archive 오류는 같은 class와 문구로 되살아난다', () => {
    for (const error of [
      new NotZipError(),
      new CorruptZipError('끝이 잘림'),
      new EncryptedZipError(),
      new SplitZipError(),
    ]) {
      const back = roundTrip(error);
      expect(back).toBeInstanceOf(error.constructor);
      expect(back.message).toBe(error.message);
    }
  });

  test('경로와 압축 방식을 가진 오류는 그 값도 되살린다', () => {
    const unsupported = roundTrip(new UnsupportedCompressionError('a.bin', 12));
    expect(unsupported).toBeInstanceOf(UnsupportedCompressionError);
    expect(unsupported).toMatchObject({ path: 'a.bin', method: 12 });
    const missing = roundTrip(new ZipEntryNotFoundError('없음.txt'));
    expect(missing).toMatchObject({ path: '없음.txt' });
  });

  test('ZIP 쓰기 오류(쓸 수 없는 항목, 새 내용 없음)도 class와 경로가 되살아나 이유를 보일 수 있다', () => {
    const invalid = roundTrip(new InvalidZipItemError('a/', '/로 끝나는 파일 경로'));
    expect(invalid).toBeInstanceOf(InvalidZipItemError);
    expect(invalid).toMatchObject({ path: 'a/' });
    const missing = roundTrip(new MissingExportDataError('new.txt'));
    expect(missing).toBeInstanceOf(MissingExportDataError);
    expect(missing).toMatchObject({ path: 'new.txt' });
  });

  test('모르는 오류는 이름과 문구를 가진 ZipWorkerError가 된다', () => {
    const back = roundTrip(new RangeError('범위 밖'));
    expect(back).toBeInstanceOf(ZipWorkerError);
    expect(back).toMatchObject({ name: 'RangeError', message: '범위 밖' });
    expect(roundTrip('문자열 오류')).toMatchObject({ name: 'Error', message: '문자열 오류' });
  });

  test('transfer 목록은 버퍼마다 한 번만 담는다', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3]);
    expect(transferablesOf({ a, b, again: a })).toEqual([a.buffer, b.buffer]);
  });
});
