import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { detectFileKind } from '../src/index';

describe('퍼즈 검사', () => {
  // 짧은 무작위 바이트는 우연히 올바른 ASCII일 수 있어(예: 0x41 = "A") 512바이트 이상만 본다.
  // 이 길이에서 무작위 바이트가 올바른 UTF-8이나 EUC-KR 한글 텍스트가 될 확률은 사실상 0이다.
  test('무작위 바이트는 텍스트로 판단하지 않는다', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 512, maxLength: 8192 }), (bytes) => {
        expect(detectFileKind('random.dat', bytes, bytes.length).kind).not.toBe('text');
      }),
      { numRuns: 2000 },
    );
  });

  // BOM은 두세 바이트뿐이라 바이너리의 앞부분도 우연히 같을 수 있다. 그 인코딩으로 읽혀야만 텍스트다(ADR-0044).
  test('BOM으로 시작해도 무작위 바이트는 텍스트로 판단하지 않는다', () => {
    const boms = [
      [0xef, 0xbb, 0xbf],
      [0xff, 0xfe],
      [0xfe, 0xff],
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...boms),
        fc.uint8Array({ minLength: 512, maxLength: 8192 }),
        (bom, rest) => {
          const bytes = new Uint8Array([...bom, ...rest]);
          expect(detectFileKind('random.dat', bytes, bytes.length).kind).not.toBe('text');
        },
      ),
      { numRuns: 2000 },
    );
  });

  // 앞에 "// "를 붙여 무작위 문자열이 우연히 서명(%PDF-, GIF89a 등)으로 시작하지 않게 한다.
  test('무작위 문자열의 UTF-8 인코딩은 항상 텍스트다', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 2000 }), (s) => {
        const bytes = new TextEncoder().encode(`// ${s.replaceAll('\u0000', '')}`);
        expect(detectFileKind('note.txt', bytes, bytes.length).kind).toBe('text');
      }),
      { numRuns: 2000 },
    );
  });
});
