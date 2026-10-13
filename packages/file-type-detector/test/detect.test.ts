import { describe, expect, test } from 'vitest';
import { HEAD_SIZE, HUGE_TEXT_BYTES, LARGE_TEXT_BYTES } from '../src/constants';
import { detectFileKind } from '../src/detect';

const utf8 = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const detect = (name: string, head: Uint8Array, totalSize = head.length) =>
  detectFileKind(name, head, totalSize);

describe('detectFileKind', () => {
  test('빈 파일은 편집할 수 있는 텍스트다. 확장자가 이미지여도 같다', () => {
    for (const name of ['empty.txt', 'blank.png', 'Makefile']) {
      expect(detect(name, new Uint8Array())).toEqual({
        kind: 'text',
        encoding: 'utf-8',
        readOnly: false,
        sizeClass: 'normal',
        reason: { rule: 'empty' },
      });
    }
  });

  test('PNG 서명은 확장자와 상관없이 이미지다', () => {
    expect(detect('photo.png', PNG)).toEqual({
      kind: 'image',
      mime: 'image/png',
      reason: { rule: 'signature', signature: 'png' },
    });
  });

  test('logo.txt인 PNG는 이미지이고 확장자 충돌을 결과에 담는다', () => {
    expect(detect('logo.txt', PNG)).toEqual({
      kind: 'image',
      mime: 'image/png',
      reason: {
        rule: 'signature',
        signature: 'png',
        extensionConflict: { extension: 'txt', expected: 'text' },
      },
    });
  });

  test('이미지 확장자끼리 달라도 충돌로 보지 않는다 (jpg 이름의 PNG)', () => {
    expect(detect('photo.jpg', PNG).reason.extensionConflict).toBeUndefined();
  });

  test('이미지 확장자인데 내용이 텍스트면 텍스트로 열고 충돌을 결과에 담는다', () => {
    expect(detect('logo.png', utf8('not really a png'))).toEqual({
      kind: 'text',
      encoding: 'utf-8',
      readOnly: false,
      sizeClass: 'normal',
      reason: { rule: 'utf-8', extensionConflict: { extension: 'png', expected: 'image' } },
    });
  });

  test('알려진 바이너리 확장자는 서명이 없어도 바이너리다', () => {
    expect(detect('font.woff2', utf8('looks like text'))).toEqual({
      kind: 'binary',
      reason: { rule: 'extension' },
    });
  });

  test('SVG 텍스트는 SVG 이미지이고, 코드로 볼 때 쓸 텍스트 정보를 함께 담는다', () => {
    expect(detect('icon.svg', utf8('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({
      kind: 'image',
      mime: 'image/svg+xml',
      text: { encoding: 'utf-8', readOnly: false, sizeClass: 'normal' },
      reason: { rule: 'utf-8' },
    });
  });

  test('UTF-16 SVG는 인코딩을 잃지 않는다', () => {
    const svg = new Uint8Array([0xff, 0xfe, ...[...'<svg/>'].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(detect('icon.SVG', svg)).toMatchObject({
      kind: 'image',
      mime: 'image/svg+xml',
      text: { encoding: 'utf-16le', readOnly: false },
    });
  });

  test('SVG가 아닌 이미지에는 텍스트 정보가 없다', () => {
    expect(detect('photo.png', PNG)).not.toHaveProperty('text');
  });

  test('확장자 없는 텍스트(Makefile)는 편집할 수 있는 텍스트다', () => {
    expect(detect('Makefile', utf8('all:\n\techo hi\n'))).toMatchObject({
      kind: 'text',
      encoding: 'utf-8',
      readOnly: false,
    });
  });

  test('모르는 확장자의 바이너리는 충돌 없이 바이너리다', () => {
    expect(detect('data.xyz', new Uint8Array([1, 0, 2]))).toEqual({
      kind: 'binary',
      reason: { rule: 'nul' },
    });
  });

  test('EUC-KR 추정 텍스트는 읽기 전용이다', () => {
    const eucKr = new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4]);
    expect(detect('readme.txt', eucKr)).toMatchObject({
      kind: 'text',
      encoding: 'euc-kr',
      readOnly: true,
    });
  });

  test('크기에 따라 sizeClass를 정한다', () => {
    const head = utf8('x');
    expect(detect('a.min.js', head, LARGE_TEXT_BYTES)).toMatchObject({ sizeClass: 'normal' });
    expect(detect('a.min.js', head, LARGE_TEXT_BYTES + 1)).toMatchObject({ sizeClass: 'large' });
    expect(detect('a.min.js', head, HUGE_TEXT_BYTES + 1)).toMatchObject({ sizeClass: 'huge' });
  });

  test('head가 전체보다 짧으면 끝이 잘린 것으로 본다', () => {
    const full = utf8('ab한');
    expect(detect('a.txt', full.subarray(0, 4), full.length)).toMatchObject({
      kind: 'text',
      encoding: 'utf-8',
    });
  });

  test('head가 8KB보다 길어도 앞 8KB만 본다', () => {
    const head = new Uint8Array(HEAD_SIZE + 10).fill(0x61);
    head[HEAD_SIZE + 5] = 0; // 8KB 뒤의 NUL은 판단에 쓰지 않는다
    expect(detect('a.txt', head, head.length)).toMatchObject({ kind: 'text', encoding: 'utf-8' });
  });
});
