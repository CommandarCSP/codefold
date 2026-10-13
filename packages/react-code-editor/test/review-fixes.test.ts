import * as monaco from 'monaco-editor/editor/editor.api.js';
import type { FileSource } from '@codefold/virtual-fs';
import { describe, expect, test } from 'vitest';
import { CodeEditorError } from '../src/errors';
import { createEditorWorkspace } from '../src/workspace';
import { memorySource, typeInto } from './helpers';

// readAll을 손으로 풀어 줄 때까지 붙잡아 두는 파일 출처. 읽는 도중에 조작이 끼어드는 경우를 만든다.
function gatedSource(items: Parameters<typeof memorySource>[0]) {
  const inner = memorySource(items);
  let release: () => void = () => undefined;
  let gate = Promise.resolve();
  const source: FileSource = {
    list: () => inner.list(),
    readHead: (path, bytes) => inner.readHead(path, bytes),
    readAll: async (path) => {
      await gate;
      return inner.readAll(path);
    },
  };
  return {
    source,
    hold: () => {
      gate = new Promise((resolve) => {
        release = resolve;
      });
    },
    release: () => release(),
  };
}

describe('읽는 도중에 이름을 바꾸거나 지운 파일', () => {
  test('옛 경로에 model이 남지 않고, 같은 이름의 새 파일은 빈 파일이다', async () => {
    const gated = gatedSource([['a.ts', 'ORIGINAL']]);
    const workspace = await createEditorWorkspace({ source: gated.source, monaco });
    gated.hold();
    const loading = workspace.loadFile('a.ts');
    workspace.renameEntry('a.ts', 'b.ts');
    gated.release();
    await expect(loading).rejects.toBeInstanceOf(CodeEditorError);
    expect(workspace.registry.get('a.ts')).toBeUndefined();
    workspace.createEntry('', 'a.ts', false);
    expect(workspace.registry.get('a.ts')?.getValue()).toBe('');
    workspace.renameEntry('b.ts', 'c.ts');
    expect(workspace.fs.getNode('c.ts')).toBeDefined();
    await workspace.loadFile('c.ts');
    expect(workspace.registry.get('c.ts')?.getValue()).toBe('ORIGINAL');
  });

  test('지운 파일은 읽기를 취소한다', async () => {
    const gated = gatedSource([['a.ts', 'ORIGINAL']]);
    const workspace = await createEditorWorkspace({ source: gated.source, monaco });
    gated.hold();
    const loading = workspace.loadFile('a.ts');
    workspace.deleteEntry('a.ts');
    gated.release();
    await expect(loading).rejects.toBeInstanceOf(CodeEditorError);
    expect(workspace.registry.get('a.ts')).toBeUndefined();
  });
});

describe('Monaco model이 새지 않는다', () => {
  test('dispose한 뒤 끝난 읽기는 model을 만들지 않는다', async () => {
    const gated = gatedSource([['a.ts', 'a']]);
    const workspace = await createEditorWorkspace({ source: gated.source, monaco });
    gated.hold();
    const loading = workspace.loadFile('a.ts');
    workspace.dispose();
    gated.release();
    await expect(loading).rejects.toBeInstanceOf(CodeEditorError);
    expect(monaco.editor.getModels()).toHaveLength(0);
  });

  test('복원이 중간에 실패하면 연 model을 치워, 다시 시도할 수 있다', async () => {
    const items: Parameters<typeof memorySource>[0] = [
      ['a.ts', 'a'],
      ['b.ts', 'b'],
    ];
    const broken = memorySource(items);
    const failing: FileSource = {
      list: () => broken.list(),
      readHead: (path, bytes) => broken.readHead(path, bytes),
      readAll: async (path) => {
        if (path === 'b.ts') throw new Error('CRC가 맞지 않습니다');
        return broken.readAll(path);
      },
    };
    const snapshot = {
      treeChanges: [],
      contents: { 'a.ts': 'A!', 'b.ts': 'B!' },
      layout: null,
      downloadRecord: null,
    };
    await expect(
      createEditorWorkspace({ source: failing, monaco, initialSnapshot: snapshot }),
    ).rejects.toThrow();
    expect(monaco.editor.getModels()).toHaveLength(0);
    const retried = await createEditorWorkspace({
      source: memorySource(items),
      monaco,
      initialSnapshot: snapshot,
    });
    expect(retried.registry.get('a.ts')?.getValue()).toBe('A!');
  });
});

describe('다운로드 계획을 만드는 도중에 트리가 바뀜', () => {
  test('고친 파일의 이름이 바뀌어도 계획을 끝까지 만든다', async () => {
    const gated = gatedSource([['a.ts', 'a']]);
    const workspace = await createEditorWorkspace({ source: gated.source, monaco });
    await workspace.loadFile('a.ts');
    workspace.registry.acquire('a.ts');
    typeInto(workspace.registry.get('a.ts')!, '!');
    gated.hold();
    const planning = workspace.createExportPlan();
    workspace.renameEntry('a.ts', 'b.ts');
    gated.release();
    const { plan } = await planning;
    expect(plan.entries).toEqual([{ type: 'write', path: 'b.ts', originalPath: 'a.ts' }]);
  });
});

describe('이미지 바이트를 붙잡아 두지 않는다', () => {
  test('이미지는 열 때마다 다시 읽는다', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const source = memorySource([['logo.png', png]]);
    const workspace = await createEditorWorkspace({ source, monaco });
    await workspace.loadFile('logo.png');
    await workspace.loadFile('logo.png');
    expect(source.reads.filter((path) => path === 'logo.png')).toHaveLength(4);
  });
});

describe('트리 변경 알림은 조작이 끝난 뒤에 나간다', () => {
  test('이름 변경 알림을 받는 순간 고친 파일 목록은 이미 새 경로다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['d/a.ts', 'a']]),
      monaco,
    });
    await workspace.loadFile('d/a.ts');
    typeInto(workspace.registry.get('d/a.ts')!, '!');
    const seen: string[][] = [];
    workspace.onTreeChange(() => seen.push([...workspace.getDirtyPaths()]));
    workspace.renameEntry('d', 'e');
    expect(seen).toEqual([['e/a.ts']]);
  });
});
