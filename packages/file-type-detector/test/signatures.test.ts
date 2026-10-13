import { describe, expect, test } from 'vitest';
import { matchSignature } from '../src/signatures';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe('matchSignature', () => {
  test.each([
    ['png', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])],
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0])],
    ['gif', bytes('GIF89a')],
    ['gif', bytes('GIF87a')],
    ['webp', bytes('RIFF', [0, 0, 0, 0], 'WEBP')],
    ['bmp', bytes('BM', [0x3a, 0, 0, 0], [0, 0, 0, 0])],
    ['ico', bytes([0, 0, 1, 0, 1, 0])],
    ['avif', bytes([0, 0, 0, 0x1c], 'ftypavif')],
    ['pdf', bytes('%PDF-1.7')],
    ['zip', bytes('PK', [3, 4])],
    ['zip', bytes('PK', [5, 6])],
    ['gzip', bytes([0x1f, 0x8b, 0x08])],
    ['woff2', bytes('wOF2', [0, 1, 0, 0])],
    ['mp3', bytes('ID3', [3, 0])],
    ['elf', bytes([0x7f], 'ELF', [2])],
    ['wasm', bytes([0], 'asm', [1, 0, 0, 0])],
    ['mp4', bytes([0, 0, 0, 0x18], 'ftypisom')],
    ['sqlite', bytes('SQLite format 3', [0])],
  ])('%s 서명을 알아본다', (name, head) => {
    expect(matchSignature(head)?.name).toBe(name);
  });

  test('이미지 서명은 MIME을 가진다', () => {
    const sig = matchSignature(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]));
    expect(sig).toMatchObject({ category: 'image', mime: 'image/png' });
  });

  test.each([
    ['BM으로 시작하는 문장', bytes('BMW is a car brand')],
    ['ID3로 시작하는 문장', bytes('ID3 tags are metadata')],
    ['PK로 시작하는 문장', bytes('PK stands for primary key')],
    ['RIFF로만 시작', bytes('RIFF raff')],
    ['빈 바이트', new Uint8Array()],
    ['너무 짧은 PNG 조각', bytes([0x89], 'PN')],
    ['ftyp가 든 문장 (mp4)', bytes('The ftyp box describes MP4 brands.')],
    ['ftypavif가 든 문장 (avif)', bytes('foo ftypavif hello')],
  ])('%s는 서명으로 보지 않는다', (_label, head) => {
    expect(matchSignature(head)).toBeUndefined();
  });
});
