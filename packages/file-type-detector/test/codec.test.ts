import { describe, expect, test } from 'vitest';
import { decodeText, encodeText, TextDecodeError } from '../src/codec';
import type { WritableTextEncoding } from '../src/types';

const SAMPLE = 'const 인사 = "안녕";\r\n// 😀 emoji\n';

describe('decodeText', () => {
  test('BOM은 내용에 넣지 않는다', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), 'utf-8-bom')).toBe('a');
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0x00]), 'utf-16le')).toBe('a');
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x61]), 'utf-16be')).toBe('a');
  });

  test('EUC-KR을 읽는다', () => {
    expect(decodeText(new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7]), 'euc-kr')).toBe('안녕');
  });

  test('앞 8KB 뒤에서 NUL이 나오면 binary-content 오류', () => {
    const bytes = new TextEncoder().encode('a'.repeat(9000) + '\u0000b');
    const error = captureError(() => decodeText(bytes, 'utf-8'));
    expect(error).toBeInstanceOf(TextDecodeError);
    expect(error).toMatchObject({ name: 'TextDecodeError', code: 'binary-content' });
  });

  test('잘못된 UTF-8은 invalid-encoding 오류', () => {
    const error = captureError(() => decodeText(new Uint8Array([0x61, 0xc3]), 'utf-8'));
    expect(error).toBeInstanceOf(TextDecodeError);
    expect(error).toMatchObject({ code: 'invalid-encoding', encoding: 'utf-8' });
  });

  test('바이트 수가 홀수인 UTF-16은 invalid-encoding 오류', () => {
    const odd = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62]);
    expect(captureError(() => decodeText(odd, 'utf-16le'))).toMatchObject({
      code: 'invalid-encoding',
    });
  });
});

describe('encodeText', () => {
  test.each<WritableTextEncoding>(['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be'])(
    '%s로 쓰고 다시 읽으면 같은 내용이다',
    (encoding) => {
      expect(decodeText(encodeText(SAMPLE, encoding), encoding)).toBe(SAMPLE);
    },
  );

  test('BOM 인코딩은 BOM을 붙인다', () => {
    expect([...encodeText('a', 'utf-8-bom')]).toEqual([0xef, 0xbb, 0xbf, 0x61]);
    expect([...encodeText('a', 'utf-16le')]).toEqual([0xff, 0xfe, 0x61, 0x00]);
    expect([...encodeText('a', 'utf-16be')]).toEqual([0xfe, 0xff, 0x00, 0x61]);
    expect([...encodeText('a', 'utf-8')]).toEqual([0x61]);
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('오류가 나지 않았다');
}

describe('짝 없는 서로게이트', () => {
  test('UTF-16으로 쓸 때 짝 없는 서로게이트는 U+FFFD로 바꿔, 쓴 결과를 다시 읽을 수 있다', () => {
    for (const encoding of ['utf-16le', 'utf-16be'] as const) {
      expect(decodeText(encodeText('a\ud800b', encoding), encoding)).toBe('a�b');
    }
  });
});
