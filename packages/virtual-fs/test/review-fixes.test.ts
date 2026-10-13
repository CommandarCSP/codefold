import { afterEach, describe, expect, test, vi } from 'vitest';
import { createVirtualFs } from '../src/virtual-fs';
import { memorySource } from './helpers';

const NONE: ReadonlySet<string> = new Set();

describe('숨긴 항목은 자기 폴더의 삭제·이름 변경을 따른다', () => {
  const zip = () =>
    memorySource([
      ['src/a.ts', 'a'],
      ['src/.DS_Store', 'x'],
      ['src/._a.ts', 'x'],
      ['__MACOSX/src/._a.ts', 'x'],
      ['README.md', 'r'],
    ]);

  test('폴더를 지우면 그 안의 숨긴 항목도 빠진다', async () => {
    const fs = await createVirtualFs(zip());
    fs.delete('src');
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: '__MACOSX/src/._a.ts', originalPath: '__MACOSX/src/._a.ts' },
      { type: 'copy', path: 'README.md', originalPath: 'README.md' },
    ]);
  });

  test('폴더 이름을 바꾸면 그 안의 숨긴 항목도 새 경로로 옮긴다', async () => {
    const fs = await createVirtualFs(zip());
    fs.rename('src', 'lib');
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'lib/a.ts', originalPath: 'src/a.ts' },
      { type: 'copy', path: 'lib/.DS_Store', originalPath: 'src/.DS_Store' },
      { type: 'copy', path: 'lib/._a.ts', originalPath: 'src/._a.ts' },
      { type: 'copy', path: '__MACOSX/src/._a.ts', originalPath: '__MACOSX/src/._a.ts' },
      { type: 'copy', path: 'README.md', originalPath: 'README.md' },
    ]);
  });

  test('파일·폴더 충돌로 숨긴 파일은 그 폴더를 지우면 빠져, 같은 이름의 새 파일과 겹치지 않는다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['a', 'file'],
        ['a/b.txt', 'b'],
      ]),
    );
    fs.delete('a');
    fs.add('', 'a', false);
    expect(fs.exportEntries(NONE)).toEqual([{ type: 'write', path: 'a' }]);
  });

  test('숨긴 항목과 같은 이름은 새로 만들 수 없다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['x', null],
        ['x/.DS_Store', 'x'],
      ]),
    );
    expect(fs.validateNewName('x', '.DS_Store')).toBe('duplicate');
    expect(fs.validateNewName('x', '.ds_store')).toBe('duplicate');
  });

  test('다시 적용해도 숨긴 항목이 같은 곳에 있다', async () => {
    const live = await createVirtualFs(zip());
    live.rename('src', 'lib');
    const restored = await createVirtualFs(zip(), { changes: live.changes() });
    expect(restored.exportEntries(NONE)).toEqual(live.exportEntries(NONE));
  });
});

describe('구독자 오류', () => {
  afterEach(() => vi.restoreAllMocks());

  test('한 구독자가 던져도 변경은 성공으로 끝나고 다른 구독자도 받는다', async () => {
    const reported: unknown[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      try {
        callback();
      } catch (error) {
        reported.push(error);
      }
    });
    const fs = await createVirtualFs(memorySource([['a.txt', 'a']]));
    const seen: string[] = [];
    fs.onDidChange(() => {
      throw new Error('구독자 버그');
    });
    fs.onDidChange((event) => seen.push(event.change.type));
    expect(() => fs.add('', 'b.txt', false)).not.toThrow();
    expect(seen).toEqual(['add']);
    expect(reported).toHaveLength(1);
  });
});

describe('자식 목록 배열의 동일성', () => {
  test('없는 폴더와 파일의 자식 목록은 늘 같은 빈 배열이다 (useSyncExternalStore)', async () => {
    const fs = await createVirtualFs(memorySource([['src/a.ts', 'a']]));
    fs.delete('src');
    expect(fs.children('src')).toBe(fs.children('src'));
    expect(fs.children('nope')).toBe(fs.children('src/a.ts'));
  });
});

describe('README 검토에서 나온 것', () => {
  test('폴더 항목 없이 foo/.DS_Store만 있으면 파일 foo를 만들 수 없다(같은 경로가 파일·폴더로 겹친다)', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['foo/.DS_Store', 'x'],
        ['a.txt', 'a'],
      ]),
    );
    expect(fs.validateNewName('', 'foo')).toBe('duplicate');
  });

  test('foo/.DS_Store만 있으면 foo를 빈 폴더로 보이고, 지우면 그 안의 숨긴 항목도 빠진다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['foo/.DS_Store', 'x'],
        ['a.txt', 'a'],
      ]),
    );
    expect(fs.getNode('foo')).toMatchObject({ isDirectory: true });
    fs.delete('foo');
    expect(fs.exportEntries(NONE).map((entry) => entry.path)).toEqual(['a.txt']);
  });

  test('__MACOSX 안의 항목과 겹치는 이름은 만들 수 없다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['__MACOSX/._a', 'x'],
        ['a', 'a'],
      ]),
    );
    expect(fs.validateNewName('', '__MACOSX')).toBe('duplicate');
  });

  test('숨긴 항목이 든 폴더도 대소문자만 바꾸는 이름 변경은 된다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['src/a.ts', 'a'],
        ['src/.DS_Store', 'x'],
      ]),
    );
    expect(fs.validateRename('src', 'SRC')).toBeUndefined();
  });

  test('__MACOSX로 시작할 뿐인 보통 폴더의 숨긴 항목은 그 폴더를 따라간다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['__MACOSX_old/a.txt', 'a'],
        ['__MACOSX_old/.DS_Store', 'x'],
      ]),
    );
    fs.rename('__MACOSX_old', 'old');
    expect(fs.exportEntries(NONE).map((entry) => entry.path)).toEqual([
      'old/a.txt',
      'old/.DS_Store',
    ]);
  });

  test('숨긴 폴더 항목은 끝의 /를 떼고 내보낸다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['__MACOSX//', null],
        ['a.txt', 'a'],
      ]),
    );
    const directories = fs.exportEntries(NONE).filter((entry) => entry.type === 'directory');
    for (const entry of directories) expect(entry.path.endsWith('/')).toBe(false);
  });
});
