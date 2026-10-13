import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { createEditorWorkspace } from '../src/workspace';
import { eucKr, memorySource, typeInto } from './helpers';

const KOREAN = '안녕하세요 '.repeat(40);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe('UTF-8로 바꿔 편집', () => {
  test('EUC-KR 파일을 바꾸면 편집할 수 있고 고친 상태가 되며, UTF-8로 다운로드한다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['old.txt', eucKr(KOREAN)]]),
      monaco,
    });
    await workspace.loadFile('old.txt');
    const changed: string[] = [];
    workspace.onFileInfoChange((path) => changed.push(path));
    workspace.convertToUtf8('old.txt');
    expect(workspace.textInfo('old.txt')).toMatchObject({ encoding: 'utf-8', readOnly: false });
    expect(workspace.registry.isDirty('old.txt')).toBe(true);
    expect(changed).toEqual(['old.txt']);
    const { plan, dirtyContents } = await workspace.createExportPlan();
    expect(plan.entries).toEqual([{ type: 'write', path: 'old.txt', originalPath: 'old.txt' }]);
    expect(text(dirtyContents['old.txt'])).toBe(KOREAN);
  });
});

describe('UTF-8 변환 복원', () => {
  test('바꾸기만 하고 고치지 않은 EUC-KR 파일도 새로고침 뒤 UTF-8 편집·고친 상태로 되살린다', async () => {
    const items: Parameters<typeof memorySource>[0] = [['old.txt', eucKr(KOREAN)]];
    const first = await createEditorWorkspace({ source: memorySource(items), monaco });
    await first.loadFile('old.txt');
    first.convertToUtf8('old.txt');
    const snapshot = await first.getSnapshot();
    first.dispose();
    const second = await createEditorWorkspace({
      source: memorySource(items),
      monaco,
      initialSnapshot: snapshot,
    });
    expect(second.getDirtyPaths()).toEqual(['old.txt']);
    expect(second.textInfo('old.txt')).toMatchObject({ encoding: 'utf-8', readOnly: false });
    const { dirtyContents } = await second.createExportPlan();
    expect(text(dirtyContents['old.txt'])).toBe(KOREAN);
  });
});

describe('SVG를 코드로 보기', () => {
  test('텍스트 model로 열고, 고친 내용은 원래 인코딩으로 다운로드한다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['icon.svg', SVG]]),
      monaco,
    });
    const file = await workspace.loadFile('icon.svg');
    expect(file.kind).toBe('image');
    expect(workspace.registry.get('icon.svg')).toBeUndefined();
    await workspace.loadAsText('icon.svg');
    const model = workspace.registry.get('icon.svg')!;
    expect(model.getValue()).toBe(SVG);
    expect(workspace.textInfo('icon.svg')?.encoding).toBe('utf-8');
    typeInto(model, '\n');
    const { dirtyContents } = await workspace.createExportPlan();
    expect(text(dirtyContents['icon.svg'])).toBe(`${SVG}\n`);
  });

  test('고친 SVG를 되돌리면 원본 내용이 된다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['icon.svg', SVG]]),
      monaco,
    });
    await workspace.loadAsText('icon.svg');
    workspace.registry.acquire('icon.svg');
    typeInto(workspace.registry.get('icon.svg')!, '\n');
    await workspace.revertFile('icon.svg');
    expect(workspace.registry.get('icon.svg')?.getValue()).toBe(SVG);
    expect(workspace.registry.isDirty('icon.svg')).toBe(false);
  });

  test('저장된 SVG 내용을 복원한다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['icon.svg', SVG]]),
      monaco,
      initialSnapshot: {
        treeChanges: [],
        contents: { 'icon.svg': `${SVG}\n` },
        layout: null,
        downloadRecord: null,
      },
    });
    expect(workspace.registry.get('icon.svg')?.getValue()).toBe(`${SVG}\n`);
    expect(workspace.registry.isDirty('icon.svg')).toBe(true);
  });

  test('이름을 바꾸거나 지우면 SVG 텍스트 정보도 따라간다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['icon.svg', SVG]]),
      monaco,
    });
    await workspace.loadAsText('icon.svg');
    workspace.renameEntry('icon.svg', 'logo.svg');
    expect(workspace.textInfo('logo.svg')?.encoding).toBe('utf-8');
    expect(workspace.textInfo('icon.svg')).toBeUndefined();
    workspace.deleteEntry('logo.svg');
    expect(workspace.textInfo('logo.svg')).toBeUndefined();
  });
});

describe('텍스트로 읽을 수 없는 SVG', () => {
  test('앞 8KB 뒤에 NUL이 있는 SVG는 이미지로만 보고 코드로 열지 않는다', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode(`<svg>${' '.repeat(9000)}`), 0]);
    const workspace = await createEditorWorkspace({
      source: memorySource([['bad.svg', bytes]]),
      monaco,
    });
    const file = await workspace.loadFile('bad.svg');
    expect(file.kind).toBe('image');
    expect(file.kind === 'image' && file.info).toBeUndefined();
    await expect(workspace.loadAsText('bad.svg')).resolves.toBeUndefined();
    expect(workspace.registry.get('bad.svg')).toBeUndefined();
  });
});

describe('자동 저장 신호', () => {
  test('되돌리기와 UTF-8 변환도 onContentChange로 알린다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([
        ['a.py', 'a'],
        ['old.txt', eucKr(KOREAN)],
      ]),
      monaco,
    });
    const changed: string[] = [];
    workspace.onContentChange((path) => changed.push(path));
    await workspace.loadFile('old.txt');
    workspace.convertToUtf8('old.txt');
    await workspace.loadFile('a.py');
    workspace.registry.acquire('a.py');
    typeInto(workspace.registry.get('a.py')!, '!');
    changed.length = 0;
    await workspace.revertFile('a.py');
    workspace.convertToUtf8('old.txt');
    expect(changed).toEqual(['a.py']);
  });

  test('UTF-8로 바꾸면 onContentChange로 알린다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['old.txt', eucKr(KOREAN)]]),
      monaco,
    });
    const changed: string[] = [];
    workspace.onContentChange((path) => changed.push(path));
    await workspace.loadFile('old.txt');
    workspace.convertToUtf8('old.txt');
    expect(changed).toEqual(['old.txt']);
  });
});
