import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { detectFileKind, HEAD_SIZE } from '../src/index';

const FILES = join(import.meta.dirname, 'fixtures', 'files');
const detectFixture = (name: string) => {
  const bytes = readFileSync(join(FILES, name));
  return detectFileKind(name, new Uint8Array(bytes.subarray(0, HEAD_SIZE)), bytes.length);
};

describe('샘플 파일 판단', () => {
  test.each([
    ['image.png', 'image/png'],
    ['image.jpg', 'image/jpeg'],
    ['image.gif', 'image/gif'],
    ['image.webp', 'image/webp'],
    ['image.bmp', 'image/bmp'],
    ['image.ico', 'image/x-icon'],
    ['image.svg', 'image/svg+xml'],
  ])('%s는 이미지(%s)다', (name, mime) => {
    expect(detectFixture(name)).toMatchObject({ kind: 'image', mime });
  });

  test.each(['doc.pdf', 'empty.zip', 'font.woff2', 'audio.mp3', 'program.elf'])(
    '%s는 바이너리다',
    (name) => {
      expect(detectFixture(name).kind).toBe('binary');
    },
  );

  test.each([
    ['utf8-ko.txt', 'utf-8', false],
    ['utf8-bom.txt', 'utf-8-bom', false],
    ['utf16le.txt', 'utf-16le', false],
    ['utf16be.txt', 'utf-16be', false],
    ['euc-kr.txt', 'euc-kr', true],
    ['Makefile', 'utf-8', false],
    ['empty.txt', 'utf-8', false],
  ])('%s는 %s 텍스트다 (읽기 전용: %s)', (name, encoding, readOnly) => {
    expect(detectFixture(name)).toMatchObject({ kind: 'text', encoding, readOnly });
  });

  test('logo.txt인 PNG는 이미지이고 확장자 충돌이 근거에 담긴다', () => {
    expect(detectFixture('logo.txt')).toMatchObject({
      kind: 'image',
      reason: { rule: 'signature', extensionConflict: { extension: 'txt', expected: 'text' } },
    });
  });
});
