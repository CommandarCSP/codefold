import { describe, expect, test } from 'vitest';
import { NotAFileError, PathNotFoundError } from '../src/errors';
import { createVirtualFs } from '../src/virtual-fs';
import { memorySource, reportTiming } from './helpers';

const NONE: ReadonlySet<string> = new Set();

describe('내보내기 계획', () => {
  test('안 바뀐 파일은 원본 복사', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['src/a.ts', 'a'],
        ['b.txt', 'b'],
      ]),
    );
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'src/a.ts', originalPath: 'src/a.ts' },
      { type: 'copy', path: 'b.txt', originalPath: 'b.txt' },
    ]);
  });

  test('내용이 바뀐 파일은 원래 경로를 가진 쓰기', async () => {
    const fs = await createVirtualFs(memorySource([['a.ts', 'a']]));
    expect(fs.exportEntries(new Set(['a.ts']))).toEqual([
      { type: 'write', path: 'a.ts', originalPath: 'a.ts' },
    ]);
  });

  test('새 파일은 원래 경로 없는 쓰기', async () => {
    const fs = await createVirtualFs(memorySource([['a.ts', 'a']]));
    fs.add('', 'new.ts', false);
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'a.ts', originalPath: 'a.ts' },
      { type: 'write', path: 'new.ts' },
    ]);
  });

  test('내용이 같은 이름 변경은 새 이름으로 복사', async () => {
    const fs = await createVirtualFs(memorySource([['run.sh', 'echo']]));
    fs.rename('run.sh', 'start.sh');
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'start.sh', originalPath: 'run.sh' },
    ]);
  });

  test('폴더 이름을 바꾼 뒤 고친 파일의 쓰기에도 원래 경로가 있다 (ADR-0032)', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['bin/run.sh', 'echo'],
        ['bin/other.sh', 'x'],
      ]),
    );
    fs.rename('bin', 'scripts');
    fs.rename('scripts/run.sh', 'start.sh');
    expect(fs.exportEntries(new Set(['scripts/start.sh']))).toEqual([
      { type: 'write', path: 'scripts/start.sh', originalPath: 'bin/run.sh' },
      { type: 'copy', path: 'scripts/other.sh', originalPath: 'bin/other.sh' },
    ]);
  });

  test('지운 파일은 빠지고, 지운 뒤 같은 이름으로 만든 파일은 원래 경로가 없다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['a.txt', 'a'],
        ['b.txt', 'b'],
      ]),
    );
    fs.delete('a.txt');
    fs.add('', 'a.txt', false);
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'b.txt', originalPath: 'b.txt' },
      { type: 'write', path: 'a.txt' },
    ]);
  });

  test('무시 목록·..·겹친 경로·파일·폴더 충돌 항목은 원본 그대로 복사한다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['__MACOSX/src/._a.ts', 'x'],
        ['src/a.ts', 'a'],
        ['../evil.sh', 'x'],
        ['/b.txt', 'slash'],
        ['b.txt', 'plain'],
        ['c', 'file'],
        ['c/d.txt', 'd'],
      ]),
    );
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: '__MACOSX/src/._a.ts', originalPath: '__MACOSX/src/._a.ts' },
      { type: 'copy', path: 'src/a.ts', originalPath: 'src/a.ts' },
      { type: 'copy', path: '../evil.sh', originalPath: '../evil.sh' },
      { type: 'copy', path: '/b.txt', originalPath: '/b.txt' },
      { type: 'copy', path: 'b.txt', originalPath: 'b.txt' },
      { type: 'copy', path: 'c', originalPath: 'c' },
      { type: 'copy', path: 'c/d.txt', originalPath: 'c/d.txt' },
    ]);
  });

  test('같은 원본 경로가 두 번 나오면 한 번만 들어간다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['a.txt', 'first'],
        ['a.txt', 'second'],
      ]),
    );
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'a.txt', originalPath: 'a.txt' },
    ]);
  });

  test('없는 경로나 폴더를 written에 넣으면 오류', async () => {
    const fs = await createVirtualFs(memorySource([['src/a.ts', 'a']]));
    expect(() => fs.exportEntries(new Set(['nope']))).toThrow(PathNotFoundError);
    expect(() => fs.exportEntries(new Set(['src']))).toThrow(NotAFileError);
  });

  test('계획은 순수 데이터다 (structuredClone 가능)', async () => {
    const fs = await createVirtualFs(memorySource([['a.ts', 'a']]));
    fs.add('', 'b.ts', false);
    const entries = fs.exportEntries(new Set(['a.ts']));
    expect(structuredClone(entries)).toEqual(entries);
  });
});

describe('빈 폴더 (ADR-0033)', () => {
  test('새로 만든 빈 폴더, 원본의 빈 폴더, 안을 모두 지운 폴더가 폴더 항목으로 나온다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['logs', null],
        ['src', null],
        ['src/a.ts', 'a'],
        ['tmp/x.txt', 'x'],
      ]),
    );
    fs.delete('tmp/x.txt');
    fs.add('', 'uploads', true);
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'directory', path: 'logs' },
      { type: 'copy', path: 'src/a.ts', originalPath: 'src/a.ts' },
      { type: 'directory', path: 'tmp' },
      { type: 'directory', path: 'uploads' },
    ]);
  });

  test('빈 하위 폴더만 든 폴더는 하위 폴더만 나온다', async () => {
    const fs = await createVirtualFs(memorySource([['a.txt', 'a']]));
    fs.add('', 'outer', true);
    fs.add('outer', 'inner', true);
    expect(fs.exportEntries(NONE)).toContainEqual({ type: 'directory', path: 'outer/inner' });
    expect(fs.exportEntries(NONE)).not.toContainEqual({ type: 'directory', path: 'outer' });
  });

  test('무시 목록 항목만 든 폴더는 트리에서 비어 보여도 폴더 항목을 넣지 않는다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['assets', null],
        ['assets/.DS_Store', 'x'],
      ]),
    );
    expect(fs.children('assets')).toEqual([]);
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: 'assets/.DS_Store', originalPath: 'assets/.DS_Store' },
    ]);
  });

  test('숨긴 폴더 항목은 그 아래에 파일이 있으면 넣지 않는다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['__MACOSX', null],
        ['__MACOSX/._a', 'x'],
        ['a', 'a'],
      ]),
    );
    expect(fs.exportEntries(NONE)).toEqual([
      { type: 'copy', path: '__MACOSX/._a', originalPath: '__MACOSX/._a' },
      { type: 'copy', path: 'a', originalPath: 'a' },
    ]);
  });
});

describe('1만 개 항목 계획', () => {
  test('5만 개 항목의 계획을 만든다', async () => {
    const items = Array.from(
      { length: 50_000 },
      (_, i) => [`pkg-${i % 100}/mod-${i}.ts`, ''] as const,
    );
    const fs = await createVirtualFs(memorySource(items));
    const started = performance.now();
    const entries = fs.exportEntries(new Set(['pkg-3/mod-3.ts']));
    const elapsed = performance.now() - started;
    expect(entries).toHaveLength(50_000);
    expect(entries[3]).toEqual({
      type: 'write',
      path: 'pkg-3/mod-3.ts',
      originalPath: 'pkg-3/mod-3.ts',
    });
    reportTiming('5만 개 항목 내보내기 계획', elapsed, 1000);
  });
});
