import { describe, expect, test } from 'vitest';
import { NotAFileError, PathNotFoundError } from '../src/errors';
import { createVirtualFs } from '../src/virtual-fs';
import { memorySource, names, reportTiming } from './helpers';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('트리 만들기', () => {
  test('폴더 항목이 없어도 경로에서 폴더가 생긴다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['src/utils/a.ts', 'a'],
        ['README.md', '# r'],
      ]),
    );
    expect(names(fs.children(''))).toEqual(['src', 'README.md']);
    expect(names(fs.children('src'))).toEqual(['utils']);
    expect(fs.getNode('src/utils')).toEqual({
      path: 'src/utils',
      name: 'utils',
      isDirectory: true,
      size: 0,
    });
    expect(fs.getNode('src/utils/a.ts')).toEqual({
      path: 'src/utils/a.ts',
      name: 'a.ts',
      isDirectory: false,
      size: 1,
    });
  });

  test('자식은 폴더 먼저, 자연 정렬 순서', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['f10.txt', ''],
        ['f2.txt', ''],
        ['lib', null],
        ['f1.txt', ''],
        ['app', null],
      ]),
    );
    expect(names(fs.children(''))).toEqual(['app', 'lib', 'f1.txt', 'f2.txt', 'f10.txt']);
  });

  test('처음 구조 버전은 0이고 변경 기록은 비어 있다', async () => {
    const fs = await createVirtualFs(memorySource([['a.txt', 'a']]));
    expect(fs.structureVersion()).toBe(0);
    expect(fs.changes()).toEqual([]);
  });

  test('트리를 만들려고 파일을 읽지 않는다', async () => {
    const source = memorySource([
      ['a.txt', 'a'],
      ['b/c.txt', 'c'],
    ]);
    await createVirtualFs(source);
    expect(source.reads).toEqual([]);
  });

  test('앞 /, 빈 구간, . 구간을 정리한다', async () => {
    const fs = await createVirtualFs(memorySource([['/src//./a.ts', 'a']]));
    expect(names(fs.children('src'))).toEqual(['a.ts']);
    expect(fs.originalPathOf('src/a.ts')).toBe('/src//./a.ts');
  });

  test('..이 든 항목과 무시 목록 항목은 트리에 없다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['../evil.sh', 'x'],
        ['__MACOSX', null],
        ['__MACOSX/._a.txt', 'x'],
        ['.DS_Store', 'x'],
        ['src/._a.ts', 'x'],
        ['src/a.ts', 'a'],
      ]),
    );
    expect(names(fs.children(''))).toEqual(['src']);
    expect(names(fs.children('src'))).toEqual(['a.ts']);
  });

  test('같은 원본 경로가 두 번 나오면 뒤 항목만 쓴다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['a.txt', 'first'],
        ['a.txt', 'second!'],
      ]),
    );
    expect(fs.children('')).toHaveLength(1);
    expect(fs.getNode('a.txt')?.size).toBe(7);
  });

  test('정리한 경로가 겹치면 뒤 항목이 트리에 들어간다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['/a.txt', 'slash'],
        ['a.txt', 'plain'],
      ]),
    );
    expect(fs.children('')).toHaveLength(1);
    expect(fs.originalPathOf('a.txt')).toBe('a.txt');
  });

  test('파일과 폴더가 같은 경로면 폴더가 트리에 들어간다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['a', 'file'],
        ['a/b.txt', 'b'],
      ]),
    );
    expect(fs.getNode('a')?.isDirectory).toBe(true);
    expect(names(fs.children('a'))).toEqual(['b.txt']);
  });

  test('없는 폴더의 자식은 빈 목록, 없는 경로의 노드는 undefined', async () => {
    const fs = await createVirtualFs(memorySource([['a.txt', 'a']]));
    expect(fs.children('nope')).toEqual([]);
    expect(fs.getNode('nope')).toBeUndefined();
  });

  test('같은 폴더의 자식 목록은 구조가 바뀌기 전까지 같은 배열이다 (렌더 최적화)', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['a.txt', 'a'],
        ['b.txt', 'b'],
      ]),
    );
    expect(fs.children('')).toBe(fs.children(''));
  });
});

describe('읽기', () => {
  test('원본 경로로 읽는다', async () => {
    const source = memorySource([['/src/a.ts', 'export const a = 1;']]);
    const fs = await createVirtualFs(source);
    expect(text(await fs.readAll('src/a.ts'))).toBe('export const a = 1;');
    expect(text(await fs.readHead('src/a.ts', 6))).toBe('export');
    expect(source.reads).toEqual(['/src/a.ts', '/src/a.ts']);
  });

  test('없는 경로는 PathNotFoundError, 폴더는 NotAFileError', async () => {
    const fs = await createVirtualFs(memorySource([['src/a.ts', 'a']]));
    await expect(fs.readAll('nope')).rejects.toBeInstanceOf(PathNotFoundError);
    await expect(fs.readAll('src')).rejects.toBeInstanceOf(NotAFileError);
    await expect(fs.readHead('', 10)).rejects.toBeInstanceOf(PathNotFoundError);
  });
});

describe('1만 개 이상 항목', () => {
  test('5만 개 항목으로 트리를 만들고 최상위를 정렬한다', async () => {
    const items = Array.from(
      { length: 50_000 },
      (_, i) => [`pkg-${i % 100}/src/mod-${i}.ts`, ''] as const,
    );
    const started = performance.now();
    const fs = await createVirtualFs(memorySource(items));
    const top = fs.children('');
    const elapsed = performance.now() - started;
    expect(top).toHaveLength(100);
    expect(names(top).slice(0, 3)).toEqual(['pkg-0', 'pkg-1', 'pkg-2']);
    expect(fs.children('pkg-7/src')).toHaveLength(500);
    reportTiming('5만 개 항목 트리 만들기', elapsed, 1000);
  });
});
