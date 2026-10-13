import * as monaco from 'monaco-editor/editor/editor.api.js';
import type { TreeChange } from '@codefold/virtual-fs';
import { describe, expect, test } from 'vitest';
import { createEditorWorkspace } from '../src/workspace';
import { fakeArea, memorySource, typeInto } from './helpers';

const setup = async () => {
  const workspace = await createEditorWorkspace({
    source: memorySource([
      ['src/main.py', 'print(1)'],
      ['src/utils/helper.py', 'def h(): pass'],
      ['README.md', '# readme'],
    ]),
    monaco,
  });
  const fake = fakeArea();
  workspace.attachArea(fake.area);
  const treeChanges: TreeChange[] = [];
  workspace.onTreeChange((change) => treeChanges.push(change));
  return { workspace, fake, treeChanges };
};

describe('추가', () => {
  test('새 파일은 빈 UTF-8 model로 만들고 부모 폴더를 펼친다', async () => {
    const { workspace, treeChanges } = await setup();
    const node = workspace.createEntry('src', 'new.py', false);
    expect(node.path).toBe('src/new.py');
    expect(workspace.registry.get('src/new.py')?.getValue()).toBe('');
    expect(workspace.textInfo('src/new.py')).toEqual({
      encoding: 'utf-8',
      readOnly: false,
      sizeClass: 'normal',
    });
    expect(workspace.store.getState().expanded.has('src')).toBe(true);
    expect(treeChanges).toEqual([{ type: 'add', path: 'src/new.py', isDirectory: false }]);
    expect(workspace.hasChanges()).toBe(true);
    expect(workspace.getUnexportedCount()).toBe(1);
  });

  test('새 폴더는 model을 만들지 않는다', async () => {
    const { workspace } = await setup();
    workspace.createEntry('', 'docs', true);
    expect(workspace.fs.getNode('docs')?.isDirectory).toBe(true);
    expect(workspace.registry.get('docs')).toBeUndefined();
  });
});

describe('삭제', () => {
  test('폴더를 지우면 안의 파일 탭을 닫고 model과 수정 표시를 치우며, 받지 않은 변경은 1개다', async () => {
    const { workspace, fake, treeChanges } = await setup();
    await workspace.loadFile('src/main.py');
    await workspace.loadFile('src/utils/helper.py');
    typeInto(workspace.registry.get('src/main.py')!, '!');
    workspace.deleteEntry('src');
    expect(fake.closed.sort()).toEqual(['src/main.py', 'src/utils/helper.py']);
    expect(workspace.registry.get('src/main.py')).toBeUndefined();
    expect(workspace.store.getState().dirty).toEqual({});
    expect(workspace.store.getState().dirtyFolders).toEqual({});
    expect(workspace.getUnexportedCount()).toBe(1);
    expect(treeChanges).toEqual([{ type: 'delete', path: 'src' }]);
  });

  test('지운 뒤 같은 이름으로 만든 파일은 새 파일이다', async () => {
    const { workspace } = await setup();
    workspace.deleteEntry('README.md');
    workspace.createEntry('', 'README.md', false);
    expect(workspace.fs.originalPathOf('README.md')).toBeUndefined();
    expect(workspace.registry.get('README.md')?.getValue()).toBe('');
  });

  test('고친 파일이 든 항목만 삭제 확인이 필요하다', async () => {
    const { workspace } = await setup();
    await workspace.loadFile('src/utils/helper.py');
    typeInto(workspace.registry.get('src/utils/helper.py')!, '!');
    expect(workspace.needsDeleteConfirm('src')).toBe(true);
    expect(workspace.needsDeleteConfirm('src/utils/helper.py')).toBe(true);
    expect(workspace.needsDeleteConfirm('src/main.py')).toBe(false);
    expect(workspace.needsDeleteConfirm('README.md')).toBe(false);
  });
});

describe('이름 변경', () => {
  test('고친 파일이 든 폴더 이름을 바꾸면 model·수정 표시·탭·펼침이 새 경로로 옮겨 간다', async () => {
    const { workspace, fake, treeChanges } = await setup();
    await workspace.loadFile('src/main.py');
    workspace.registry.acquire('src/main.py');
    typeInto(workspace.registry.get('src/main.py')!, '!');
    workspace.store.getState().expand('src');
    workspace.store.getState().expand('src/utils');
    workspace.renameEntry('src', 'app');
    expect(workspace.registry.get('app/main.py')?.getValue()).toBe('print(1)!');
    expect(workspace.store.getState().dirty).toEqual({ 'app/main.py': true });
    expect(workspace.store.getState().dirtyFolders).toEqual({ app: 1 });
    expect(workspace.textInfo('app/main.py')?.encoding).toBe('utf-8');
    expect(fake.renamed).toContainEqual(['src/main.py', 'app/main.py']);
    expect([...workspace.store.getState().expanded].sort()).toEqual(['app', 'app/utils']);
    expect(treeChanges).toEqual([{ type: 'rename', from: 'src', to: 'app' }]);
    // 한 번도 받지 않았으므로 고친 파일 1개와 이름 변경 1개다. 받은 뒤 이름만 바꾸면 1개다(작업 5).
    expect(workspace.getUnexportedCount()).toBe(2);
  });

  test('연 적 없는 파일의 이름을 바꿔도 새 이름으로 원본을 읽는다', async () => {
    const { workspace } = await setup();
    workspace.renameEntry('README.md', 'README.txt');
    await workspace.loadFile('README.txt');
    expect(workspace.registry.get('README.txt')?.getValue()).toBe('# readme');
  });

  test('같은 이름으로 바꾸면 아무것도 하지 않는다', async () => {
    const { workspace, treeChanges } = await setup();
    workspace.renameEntry('README.md', 'README.md');
    expect(treeChanges).toEqual([]);
    expect(workspace.hasChanges()).toBe(false);
  });
});

describe('변경 되돌리기', () => {
  test('고친 파일을 원본 내용으로 되돌리고 수정 표시를 거둔다', async () => {
    const { workspace } = await setup();
    await workspace.loadFile('src/main.py');
    workspace.registry.acquire('src/main.py');
    typeInto(workspace.registry.get('src/main.py')!, '!');
    await workspace.revertFile('src/main.py');
    expect(workspace.registry.get('src/main.py')?.getValue()).toBe('print(1)');
    expect(workspace.registry.isDirty('src/main.py')).toBe(false);
    expect(workspace.store.getState().dirty).toEqual({});
  });

  test('이름을 바꾼 뒤 되돌리면 옛 이름의 원본 내용이 된다', async () => {
    const { workspace } = await setup();
    await workspace.loadFile('README.md');
    workspace.registry.acquire('README.md');
    typeInto(workspace.registry.get('README.md')!, '!');
    workspace.renameEntry('README.md', 'README.txt');
    await workspace.revertFile('README.txt');
    expect(workspace.registry.get('README.txt')?.getValue()).toBe('# readme');
    expect(workspace.registry.isDirty('README.txt')).toBe(false);
  });
});
