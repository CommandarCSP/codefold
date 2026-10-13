import { describe, expect, test } from 'vitest';
import { InvalidNameError, PathNotFoundError, ReplayError } from '../src/errors';
import type { VirtualFs } from '../src/virtual-fs';
import { createVirtualFs } from '../src/virtual-fs';
import { memorySource } from './helpers';

const items = [
  ['src/main.py', 'print(1)'],
  ['src/utils/helper.py', 'def h(): pass'],
  ['README.md', '# readme'],
] as const;

// 트리 전체를 경로 → (폴더 여부, 원본 경로)로 펼친다.
function snapshot(fs: VirtualFs, dir = '', out: Record<string, unknown> = {}) {
  for (const node of fs.children(dir)) {
    out[node.path] = [node.isDirectory, fs.originalPathOf(node.path)];
    if (node.isDirectory) snapshot(fs, node.path, out);
  }
  return out;
}

describe('저장된 변경 다시 적용', () => {
  test('변경 목록을 원본에 다시 적용하면 같은 트리가 나온다', async () => {
    const live = await createVirtualFs(memorySource(items));
    live.add('src', 'models', true);
    live.add('src/models', 'user.py', false);
    live.rename('src', 'app');
    live.delete('app/utils');
    live.rename('README.md', 'README.txt');
    live.delete('README.txt');
    live.add('', 'README.txt', false);

    const restored = await createVirtualFs(memorySource(items), { changes: live.changes() });
    expect(snapshot(restored)).toEqual(snapshot(live));
    expect(restored.structureVersion()).toBe(7);
    expect(restored.changes()).toEqual(live.changes());
    expect(restored.originalPathOf('app/main.py')).toBe('src/main.py');
    expect(restored.originalPathOf('README.txt')).toBeUndefined();
  });

  test('다시 적용한 뒤에도 조작이 이어서 쌓인다', async () => {
    const restored = await createVirtualFs(memorySource(items), {
      changes: [{ type: 'add', path: 'a.txt', isDirectory: false }],
    });
    restored.add('', 'b.txt', false);
    expect(restored.structureVersion()).toBe(2);
    expect(restored.changes()).toHaveLength(2);
  });

  test('원본과 맞지 않는 변경은 ReplayError로 알린다 (몇 번째인지와 원인 포함)', async () => {
    const changes = [
      { type: 'add', path: 'a.txt', isDirectory: false },
      { type: 'delete', path: 'not-in-this-zip.txt' },
    ] as const;
    const error = await createVirtualFs(memorySource(items), { changes }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayError);
    expect(error).toMatchObject({ index: 1, change: changes[1] });
    // index는 0부터 세지만, 메시지는 사람이 읽으므로 1부터 센다.
    expect((error as ReplayError).message).toContain('2번째');
    expect((error as ReplayError).cause).toBeInstanceOf(PathNotFoundError);
  });

  test('이미 있는 이름을 만드는 변경도 ReplayError', async () => {
    const error = await createVirtualFs(memorySource(items), {
      changes: [{ type: 'add', path: 'README.md', isDirectory: false }],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayError);
    expect((error as ReplayError).cause).toBeInstanceOf(InvalidNameError);
  });

  test('다른 폴더로 옮기는 이름 변경은 ReplayError (옮기기 없음)', async () => {
    const error = await createVirtualFs(memorySource(items), {
      changes: [{ type: 'rename', from: 'README.md', to: 'src/README.md' }],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayError);
  });

  test('다시 적용하는 동안에는 구독자가 없어 이벤트가 없다', async () => {
    const restored = await createVirtualFs(memorySource(items), {
      changes: [{ type: 'add', path: 'a.txt', isDirectory: false }],
    });
    const seen: unknown[] = [];
    restored.onDidChange((e) => seen.push(e));
    expect(seen).toEqual([]);
  });
});
