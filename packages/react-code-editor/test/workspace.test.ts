import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { NotTextFileError } from '../src/errors';
import { createEditorWorkspace } from '../src/workspace';
import { eucKr, fakeArea, memorySource, typeInto } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const KOREAN = '안녕하세요 '.repeat(40);

const open = (items: Parameters<typeof memorySource>[0]) => {
  const source = memorySource(items);
  return createEditorWorkspace({ source, monaco }).then((workspace) => ({ workspace, source }));
};

describe('파일 읽기', () => {
  test('텍스트 파일을 열면 model을 만들고, 다시 열면 읽지 않는다', async () => {
    const { workspace, source } = await open([['src/a.ts', 'export const a = 1;']]);
    const file = await workspace.loadFile('src/a.ts');
    expect(file).toMatchObject({
      kind: 'text',
      path: 'src/a.ts',
      info: { encoding: 'utf-8', readOnly: false },
    });
    expect(workspace.registry.get('src/a.ts')?.getValue()).toBe('export const a = 1;');
    const reads = source.reads.length;
    await workspace.loadFile('src/a.ts');
    expect(source.reads.length).toBe(reads);
  });

  test('같은 파일을 동시에 열어도 한 번만 읽는다', async () => {
    const { workspace, source } = await open([['a.ts', 'a']]);
    await Promise.all([workspace.loadFile('a.ts'), workspace.loadFile('a.ts')]);
    expect(source.reads.filter((path) => path === 'a.ts')).toHaveLength(2); // 앞부분 한 번, 전체 한 번
  });

  test('EUC-KR 텍스트는 읽기 전용으로 연다', async () => {
    const { workspace } = await open([['old.txt', eucKr(KOREAN)]]);
    const file = await workspace.loadFile('old.txt');
    expect(file).toMatchObject({ kind: 'text', info: { encoding: 'euc-kr', readOnly: true } });
    expect(workspace.registry.get('old.txt')?.getValue()).toBe(KOREAN);
  });

  test('앞 8KB는 ASCII이고 뒤에 EUC-KR이 있으면 전체로 다시 판단해 EUC-KR로 연다', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('a'.repeat(9000)), ...eucKr(KOREAN)]);
    const { workspace } = await open([['late.txt', bytes]]);
    const file = await workspace.loadFile('late.txt');
    expect(file).toMatchObject({ kind: 'text', info: { encoding: 'euc-kr', readOnly: true } });
    expect(workspace.registry.get('late.txt')?.getValue().endsWith(KOREAN)).toBe(true);
  });

  test('앞 8KB 뒤에 NUL이 있으면 바이너리로 본다', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('a'.repeat(9000)), 0, 1, 2]);
    const { workspace } = await open([['data.txt', bytes]]);
    expect(await workspace.loadFile('data.txt')).toMatchObject({ kind: 'binary' });
    expect(workspace.registry.get('data.txt')).toBeUndefined();
  });

  test('이미지는 바이트를 돌려주고 model을 만들지 않는다', async () => {
    const { workspace } = await open([['logo.png', PNG]]);
    const file = await workspace.loadFile('logo.png');
    expect(file).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(file.kind === 'image' && file.bytes.length).toBe(PNG.length);
    expect(workspace.registry.get('logo.png')).toBeUndefined();
  });

  test('탭이 닫혀 model이 지워진 파일을 다시 열면 model을 다시 만든다', async () => {
    const { workspace } = await open([['a.ts', 'a']]);
    await workspace.loadFile('a.ts');
    workspace.registry.acquire('a.ts');
    workspace.registry.release('a.ts');
    expect(workspace.registry.get('a.ts')).toBeUndefined();
    await workspace.loadFile('a.ts');
    expect(workspace.registry.get('a.ts')?.getValue()).toBe('a');
  });
});

describe('readText', () => {
  test('고친 파일은 model 내용을, 연 적 없는 파일은 원본을 model 없이 읽는다', async () => {
    const { workspace } = await open([
      ['a.ts', 'a'],
      ['b.ts', 'b'],
      ['logo.png', PNG],
    ]);
    await workspace.loadFile('a.ts');
    typeInto(workspace.registry.get('a.ts')!, '!');
    expect(await workspace.readText('a.ts')).toBe('a!');
    expect(await workspace.readText('b.ts')).toBe('b');
    expect(workspace.registry.get('b.ts')).toBeUndefined();
    await expect(workspace.readText('logo.png')).rejects.toBeInstanceOf(NotTextFileError);
  });
});

describe('수정 여부와 구독', () => {
  test('고치면 스토어·구독·hasChanges가 바뀌고, undo로 돌아가면 되돌아간다', async () => {
    const { workspace } = await open([['src/a.ts', 'a']]);
    const dirtyEvents: Array<[string, boolean]> = [];
    const changes: boolean[] = [];
    workspace.onDirtyChange((path, dirty) => dirtyEvents.push([path, dirty]));
    workspace.onChangesChange((has) => changes.push(has));
    await workspace.loadFile('src/a.ts');
    const model = workspace.registry.get('src/a.ts')!;
    typeInto(model, 'b');
    typeInto(model, 'c');
    expect(workspace.store.getState().dirty).toEqual({ 'src/a.ts': true });
    expect(workspace.store.getState().dirtyFolders).toEqual({ src: 1 });
    expect(workspace.hasChanges()).toBe(true);
    expect(workspace.getDirtyPaths()).toEqual(['src/a.ts']);
    model.undo();
    model.undo();
    expect(workspace.hasChanges()).toBe(false);
    expect(dirtyEvents).toEqual([
      ['src/a.ts', true],
      ['src/a.ts', false],
    ]);
    expect(changes).toEqual([true, false]);
  });

  test('onContentChange는 입력마다 경로를 알린다', async () => {
    const { workspace } = await open([['a.ts', 'a']]);
    const paths: string[] = [];
    workspace.onContentChange((path) => paths.push(path));
    await workspace.loadFile('a.ts');
    const model = workspace.registry.get('a.ts')!;
    typeInto(model, 'b');
    typeInto(model, 'c');
    expect(paths).toEqual(['a.ts', 'a.ts']);
  });

  test('onUnexportedChange는 받지 않은 변경 상태를 그대로 알린다', async () => {
    const { workspace } = await open([['a.ts', 'a']]);
    const states: unknown[] = [];
    workspace.onUnexportedChange((state) => states.push(state));
    await workspace.loadFile('a.ts');
    typeInto(workspace.registry.get('a.ts')!, 'b');
    expect(states).toEqual([{ has: true, count: 1 }]);
    expect(workspace.getUnexportedCount()).toBe(1);
  });
});

describe('에디터 영역 연결', () => {
  test('openFile은 영역에 탭을 열게 한다', async () => {
    const { workspace } = await open([['a.ts', 'a']]);
    const fake = fakeArea();
    workspace.attachArea(fake.area);
    workspace.openFile('a.ts');
    workspace.focusEditor();
    expect(fake.opened).toEqual(['a.ts']);
    expect(fake.focusCount()).toBe(1);
  });

  test('활성 탭이 바뀌면 스토어에 기록하고 부모 폴더를 펼친다', async () => {
    const { workspace } = await open([['src/deep/a.ts', 'a']]);
    const fake = fakeArea();
    workspace.attachArea(fake.area);
    fake.emitActive('src/deep/a.ts');
    expect(workspace.store.getState().activePath).toBe('src/deep/a.ts');
    expect([...workspace.store.getState().expanded].sort()).toEqual(['src', 'src/deep']);
    fake.emitActive(undefined);
    expect(workspace.store.getState().activePath).toBeUndefined();
  });

  test('영역 연결을 풀면 더 알림을 받지 않는다', async () => {
    const { workspace } = await open([['a.ts', 'a']]);
    const fake = fakeArea();
    workspace.attachArea(fake.area).dispose();
    fake.emitActive('a.ts');
    workspace.openFile('a.ts');
    expect(workspace.store.getState().activePath).toBeUndefined();
    expect(fake.opened).toEqual([]);
  });
});

describe('정리', () => {
  test('dispose하면 model을 모두 지운다', async () => {
    const { workspace } = await open([['a.ts', 'a']]);
    await workspace.loadFile('a.ts');
    const model = workspace.registry.get('a.ts')!;
    workspace.dispose();
    expect(model.isDisposed()).toBe(true);
  });
});
