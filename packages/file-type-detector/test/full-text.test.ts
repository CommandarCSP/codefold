import { describe, expect, test } from 'vitest';
import { decodeText, detectFileKind, detectTextEncoding, HEAD_SIZE } from '../src/index';

// 앞 8KB는 ASCII뿐이고 그 뒤에 EUC-KR 한글("안녕")이 나오는 파일. 옛 한국어 소스·CSV에 흔하다.
const asciiThenEucKr = new Uint8Array([
  ...new Uint8Array(8300).fill(0x61),
  0xbe,
  0xc8,
  0xb3,
  0xe7,
  0x0a,
]);

describe('detectTextEncoding (전체 바이트로 인코딩 다시 판단)', () => {
  test('앞 8KB만으로는 UTF-8로 보이지만 전체를 보면 EUC-KR이다', () => {
    const head = asciiThenEucKr.subarray(0, HEAD_SIZE);
    expect(detectFileKind('main.c', head, asciiThenEucKr.length)).toMatchObject({
      kind: 'text',
      encoding: 'utf-8',
    });
    expect(() => decodeText(asciiThenEucKr, 'utf-8')).toThrow();
    expect(detectTextEncoding(asciiThenEucKr)).toBe('euc-kr');
  });

  test('전체가 올바른 UTF-8이면 utf-8', () => {
    expect(detectTextEncoding(new TextEncoder().encode('a'.repeat(9000) + '한글'))).toBe('utf-8');
  });

  test('전체를 봐도 텍스트가 아니면 undefined', () => {
    expect(detectTextEncoding(new Uint8Array([0x61, 0x00, 0x62]))).toBeUndefined();
  });
});
