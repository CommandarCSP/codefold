import { describe, expect, test } from 'vitest';
import {
  InvalidNameError,
  NotADirectoryError,
  NotAFileError,
  PathNotFoundError,
  ReplayError,
  VirtualFsError,
} from '../src/errors';
import { entryKey, joinPath, nameOf, parentOf, placeEntry } from '../src/paths';

describe('placeEntry', () => {
  test.each([
    ['src/a.ts', 'src/a.ts'],
    ['/src/a.ts', 'src/a.ts'],
    ['src//a.ts', 'src/a.ts'],
    ['./src/./a.ts', 'src/a.ts'],
    ['한글/파일.txt', '한글/파일.txt'],
  ])('%s → 트리 경로 %s', (raw, path) => {
    expect(placeEntry(raw)).toEqual({ kind: 'tree', path });
  });

  test.each(['../evil.sh', 'a/../../b', 'a/..'])('%s는 트리에 넣지 않는다 (unsafe)', (raw) => {
    expect(placeEntry(raw)).toEqual({ kind: 'hidden', reason: 'unsafe' });
  });

  test.each(['/', './', '//'])('%s는 정리하면 비어서 트리에 넣지 않는다', (raw) => {
    expect(placeEntry(raw)).toEqual({ kind: 'hidden', reason: 'empty' });
  });

  test.each([
    '__MACOSX',
    '__MACOSX/project/._main.py',
    'project/.DS_Store',
    '.DS_Store',
    'src/._notes.txt',
  ])('%s는 무시 목록에 걸린다', (raw) => {
    expect(placeEntry(raw)).toEqual({ kind: 'hidden', reason: 'ignored' });
  });

  test('이름 중간의 __MACOSX, 점으로 시작하는 보통 파일은 걸리지 않는다', () => {
    expect(placeEntry('docs/__MACOSX.md')).toEqual({ kind: 'tree', path: 'docs/__MACOSX.md' });
    expect(placeEntry('.gitignore')).toEqual({ kind: 'tree', path: '.gitignore' });
    expect(placeEntry('src/.env.local')).toEqual({ kind: 'tree', path: 'src/.env.local' });
  });
});

describe('경로 도우미', () => {
  test('parentOf·nameOf·joinPath', () => {
    expect(parentOf('a/b/c.txt')).toBe('a/b');
    expect(parentOf('c.txt')).toBe('');
    expect(nameOf('a/b/c.txt')).toBe('c.txt');
    expect(nameOf('c.txt')).toBe('c.txt');
    expect(joinPath('', 'c.txt')).toBe('c.txt');
    expect(joinPath('a/b', 'c.txt')).toBe('a/b/c.txt');
  });

  test('entryKey는 빈 구간과 . 구간만 없앤다', () => {
    expect(entryKey('/__MACOSX//x/./y')).toBe('__MACOSX/x/y');
    expect(entryKey('../x')).toBe('../x');
  });
});

describe('오류 class', () => {
  test.each([
    [new PathNotFoundError('a'), 'PathNotFoundError'],
    [new NotADirectoryError('a'), 'NotADirectoryError'],
    [new NotAFileError('a'), 'NotAFileError'],
    [new InvalidNameError('a/b', 'invalid-character'), 'InvalidNameError'],
    [new ReplayError(2, { type: 'delete', path: 'a' }, new PathNotFoundError('a')), 'ReplayError'],
  ])('%s는 VirtualFsError이고 이름으로 구분된다', (error, name) => {
    expect(error).toBeInstanceOf(VirtualFsError);
    expect(error.name).toBe(name);
  });

  test('오류는 원인이 된 값을 필드로 가진다', () => {
    expect(new InvalidNameError('a/b', 'invalid-character')).toMatchObject({
      invalidName: 'a/b',
      problem: 'invalid-character',
    });
    const cause = new PathNotFoundError('a');
    expect(new ReplayError(2, { type: 'delete', path: 'a' }, cause)).toMatchObject({
      index: 2,
      change: { type: 'delete', path: 'a' },
      cause,
    });
  });
});
