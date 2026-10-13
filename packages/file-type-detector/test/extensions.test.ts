import { describe, expect, test } from 'vitest';
import {
  expectedCategory,
  extensionOf,
  guessKindByExtension,
  imageMimeForExtension,
} from '../src/extensions';

describe('extensionOf', () => {
  test.each([
    ['main.py', 'py'],
    ['src/App.TSX', 'tsx'],
    ['archive.tar.gz', 'gz'],
    ['Makefile', ''],
    ['.gitignore', ''],
    ['docs/.env.local', 'local'],
    ['folder.v2/README', ''],
  ])('%s → "%s"', (name, ext) => {
    expect(extensionOf(name)).toBe(ext);
  });
});

describe('expectedCategory', () => {
  test('이미지 확장자는 image', () => {
    expect(expectedCategory('png')).toBe('image');
    expect(expectedCategory('svg')).toBe('image');
  });
  test('알려진 바이너리 확장자는 binary', () => {
    expect(expectedCategory('pdf')).toBe('binary');
    expect(expectedCategory('woff2')).toBe('binary');
  });
  test('알려진 텍스트 확장자는 text', () => {
    expect(expectedCategory('txt')).toBe('text');
    expect(expectedCategory('ts')).toBe('text');
  });
  test('모르는 확장자와 빈 확장자는 예상하지 않는다', () => {
    expect(expectedCategory('xyz')).toBeUndefined();
    expect(expectedCategory('')).toBeUndefined();
  });
  test('Object 프로토타입 이름을 확장자로 취급하지 않는다', () => {
    expect(expectedCategory('constructor')).toBeUndefined();
    expect(expectedCategory('__proto__')).toBeUndefined();
  });
});

describe('imageMimeForExtension', () => {
  test('이미지 확장자의 MIME을 돌려준다', () => {
    expect(imageMimeForExtension('jpg')).toBe('image/jpeg');
    expect(imageMimeForExtension('svg')).toBe('image/svg+xml');
    expect(imageMimeForExtension('txt')).toBeUndefined();
  });
});

describe('guessKindByExtension (트리 아이콘용)', () => {
  test('모르는 확장자는 text로 본다', () => {
    expect(guessKindByExtension('a/b/c.xyz')).toBe('text');
    expect(guessKindByExtension('Makefile')).toBe('text');
  });
  test('이미지와 바이너리를 구분한다', () => {
    expect(guessKindByExtension('logo.PNG')).toBe('image');
    expect(guessKindByExtension('font.woff2')).toBe('binary');
  });
});
