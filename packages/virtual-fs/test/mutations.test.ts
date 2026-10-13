import { describe, expect, test } from 'vitest';
import { InvalidNameError, NotADirectoryError, PathNotFoundError } from '../src/errors';
import type { TreeChangeEvent } from '../src/virtual-fs';
import { createVirtualFs } from '../src/virtual-fs';
import { memorySource, names } from './helpers';

const project = () =>
  memorySource([
    ['src/main.py', 'print(1)'],
    ['src/utils/helper.py', 'def h(): pass'],
    ['README.md', '# readme'],
  ]);

describe('추가', () => {
  test('폴더 안에 파일과 폴더를 만들고 정렬 위치에 넣는다', async () => {
    const fs = await createVirtualFs(project());
    expect(fs.add('src', 'a.py', false)).toEqual({
      path: 'src/a.py',
      name: 'a.py',
      isDirectory: false,
      size: 0,
    });
    fs.add('src', 'models', true);
    expect(names(fs.children('src'))).toEqual(['models', 'utils', 'a.py', 'main.py']);
    fs.add('', 'setup.cfg', false);
    expect(names(fs.children(''))).toEqual(['src', 'README.md', 'setup.cfg']);
  });

  test('새 파일은 원본 경로가 없고 읽으면 빈 바이트다', async () => {
    const source = project();
    const fs = await createVirtualFs(source);
    fs.add('src', 'new.py', false);
    expect(fs.originalPathOf('src/new.py')).toBeUndefined();
    expect((await fs.readAll('src/new.py')).length).toBe(0);
    expect(source.reads).toEqual([]);
  });

  test('없는 폴더는 PathNotFoundError, 파일 안에는 NotADirectoryError', async () => {
    const fs = await createVirtualFs(project());
    expect(() => fs.add('nope', 'a', false)).toThrow(PathNotFoundError);
    expect(() => fs.add('README.md', 'a', false)).toThrow(NotADirectoryError);
  });

  test('입력한 이름은 NFC로 바꿔 쓴다', async () => {
    const fs = await createVirtualFs(project());
    const node = fs.add('', '한글.txt'.normalize('NFD'), false);
    expect(node.path).toBe('한글.txt'.normalize('NFC'));
  });
});

describe('이름 검증', () => {
  test('이유를 구분해 돌려준다', async () => {
    const fs = await createVirtualFs(project());
    expect(fs.validateNewName('src', 'main.py')).toBe('duplicate');
    expect(fs.validateNewName('src', 'utils')).toBe('duplicate');
    expect(fs.validateNewName('src', '')).toBe('empty');
    expect(fs.validateNewName('src', '..')).toBe('reserved');
    expect(fs.validateNewName('src', 'a/b')).toBe('invalid-character');
    expect(fs.validateNewName('src', 'other.py')).toBeUndefined();
  });

  test('대소문자·NFD만 다른 이름도 중복이다', async () => {
    const fs = await createVirtualFs(
      memorySource([
        ['README.md', ''],
        ['한글.txt', ''],
      ]),
    );
    expect(fs.validateNewName('', 'readme.md')).toBe('duplicate');
    expect(fs.validateNewName('', '한글.txt'.normalize('NFD'))).toBe('duplicate');
  });

  test('쓸 수 없는 이름으로 만들면 InvalidNameError', async () => {
    const fs = await createVirtualFs(project());
    const error = (() => {
      try {
        fs.add('src', 'main.py', false);
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(InvalidNameError);
    expect(error).toMatchObject({ problem: 'duplicate', invalidName: 'main.py' });
  });

  test('이름을 바꿀 때 자기 자신은 중복으로 보지 않는다', async () => {
    const fs = await createVirtualFs(project());
    expect(fs.validateRename('README.md', 'readme.md')).toBeUndefined();
    expect(fs.validateRename('README.md', 'README.md')).toBeUndefined();
    expect(fs.validateRename('src/main.py', 'utils')).toBe('duplicate');
  });
});

describe('삭제', () => {
  test('폴더를 지우면 안의 항목까지 모두 지우고 지운 노드를 부모 먼저 돌려준다', async () => {
    const fs = await createVirtualFs(project());
    const removed = fs.delete('src');
    expect(removed[0]?.path).toBe('src');
    expect(removed.map((n) => n.path).sort()).toEqual([
      'src',
      'src/main.py',
      'src/utils',
      'src/utils/helper.py',
    ]);
    expect(names(fs.children(''))).toEqual(['README.md']);
    expect(fs.getNode('src/utils/helper.py')).toBeUndefined();
  });

  test('최상위와 없는 경로는 PathNotFoundError', async () => {
    const fs = await createVirtualFs(project());
    expect(() => fs.delete('')).toThrow(PathNotFoundError);
    expect(() => fs.delete('nope')).toThrow(PathNotFoundError);
  });

  test('지운 뒤 같은 이름으로 새로 만든 파일은 원본 경로가 없다 (ADR-0032)', async () => {
    const source = project();
    const fs = await createVirtualFs(source);
    fs.delete('README.md');
    fs.add('', 'README.md', false);
    expect(fs.originalPathOf('README.md')).toBeUndefined();
    expect((await fs.readAll('README.md')).length).toBe(0);
    expect(source.reads).toEqual([]);
  });
});

describe('이름 변경', () => {
  test('파일 이름을 바꾸면 원본 경로를 이어 가지고, 읽으면 원본을 읽는다', async () => {
    const source = project();
    const fs = await createVirtualFs(source);
    expect(fs.rename('src/main.py', 'app.py')).toEqual([
      { from: 'src/main.py', to: 'src/app.py', isDirectory: false },
    ]);
    expect(fs.originalPathOf('src/app.py')).toBe('src/main.py');
    expect(new TextDecoder().decode(await fs.readAll('src/app.py'))).toBe('print(1)');
    expect(names(fs.children('src'))).toEqual(['utils', 'app.py']);
  });

  test('폴더 이름을 바꾸면 안의 항목도 모두 옮긴다', async () => {
    const fs = await createVirtualFs(project());
    const moved = fs.rename('src', 'lib');
    expect(moved[0]).toEqual({ from: 'src', to: 'lib', isDirectory: true });
    expect(moved.map((m) => m.to).sort()).toEqual([
      'lib',
      'lib/main.py',
      'lib/utils',
      'lib/utils/helper.py',
    ]);
    expect(fs.getNode('src')).toBeUndefined();
    expect(names(fs.children('lib/utils'))).toEqual(['helper.py']);
    expect(fs.originalPathOf('lib/utils/helper.py')).toBe('src/utils/helper.py');
  });

  test('같은 이름으로 바꾸면 아무 일도 하지 않는다', async () => {
    const fs = await createVirtualFs(project());
    expect(fs.rename('README.md', 'README.md')).toEqual([]);
    expect(fs.structureVersion()).toBe(0);
    expect(fs.changes()).toEqual([]);
  });

  test('대소문자만 바꾸는 이름 변경은 된다', async () => {
    const fs = await createVirtualFs(project());
    fs.rename('README.md', 'readme.md');
    expect(names(fs.children(''))).toEqual(['src', 'readme.md']);
  });

  test('쓸 수 없는 이름은 InvalidNameError, 최상위는 PathNotFoundError', async () => {
    const fs = await createVirtualFs(project());
    expect(() => fs.rename('src/main.py', 'utils')).toThrow(InvalidNameError);
    expect(() => fs.rename('', 'x')).toThrow(PathNotFoundError);
  });
});

describe('구조 버전과 변경 기록', () => {
  test('추가·삭제·이름 변경마다 1씩 오르고 변경이 순서대로 쌓인다', async () => {
    const fs = await createVirtualFs(project());
    fs.add('src', 'a.py', false);
    fs.rename('src/a.py', 'b.py');
    fs.delete('src/b.py');
    fs.add('', 'docs', true);
    expect(fs.structureVersion()).toBe(4);
    expect(fs.changes()).toEqual([
      { type: 'add', path: 'src/a.py', isDirectory: false },
      { type: 'rename', from: 'src/a.py', to: 'src/b.py' },
      { type: 'delete', path: 'src/b.py' },
      { type: 'add', path: 'docs', isDirectory: true },
    ]);
  });

  test('실패한 조작은 버전과 기록을 바꾸지 않는다', async () => {
    const fs = await createVirtualFs(project());
    expect(() => fs.add('src', 'main.py', false)).toThrow();
    expect(fs.structureVersion()).toBe(0);
    expect(fs.changes()).toEqual([]);
  });

  test('onDidChange는 변경마다 새 버전과 함께 부르고, dispose하면 멈춘다', async () => {
    const fs = await createVirtualFs(project());
    const events: TreeChangeEvent[] = [];
    const subscription = fs.onDidChange((event) => events.push(event));
    fs.add('', 'a.txt', false);
    subscription.dispose();
    fs.add('', 'b.txt', false);
    expect(events).toEqual([
      { change: { type: 'add', path: 'a.txt', isDirectory: false }, structureVersion: 1 },
    ]);
  });

  test('구조가 바뀐 폴더만 자식 목록 배열이 새로 만들어진다', async () => {
    const fs = await createVirtualFs(project());
    const top = fs.children('');
    const utils = fs.children('src/utils');
    fs.add('src', 'a.py', false);
    expect(fs.children('')).toBe(top);
    expect(fs.children('src/utils')).toBe(utils);
  });
});
