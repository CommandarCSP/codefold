import { decodeText } from '@codefold/file-type-detector';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { sha256Hex, utf8 } from '../src/sha256';
import type { WorkspaceSnapshot } from '../src/types';
import { createEditorWorkspace } from '../src/workspace';
import { eucKr, memorySource, typeInto } from './helpers';

type Items = Parameters<typeof memorySource>[0];
const setup = (items: Items, initialSnapshot?: WorkspaceSnapshot) =>
  createEditorWorkspace({ source: memorySource(items), monaco, initialSnapshot });

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
const KOREAN = '안녕하세요 '.repeat(40);
const utf16le = (value: string) =>
  new Uint8Array([
    0xff,
    0xfe,
    ...[...value].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]),
  ]);

describe('내보내기 계획', () => {
  test('안 바뀐 파일은 원본 복사, 고친 파일은 원래 경로를 가진 쓰기와 바이트·지문', async () => {
    const workspace = await setup([
      ['a.ts', 'a'],
      ['b.ts', 'b'],
    ]);
    await workspace.loadFile('a.ts');
    const model = workspace.registry.get('a.ts')!;
    typeInto(model, '!');
    const { plan, dirtyContents } = await workspace.createExportPlan();
    expect(plan.entries).toEqual([
      { type: 'write', path: 'a.ts', originalPath: 'a.ts' },
      { type: 'copy', path: 'b.ts', originalPath: 'b.ts' },
    ]);
    expect(text(dirtyContents['a.ts'])).toBe('a!');
    expect(Object.keys(dirtyContents)).toEqual(['a.ts']);
    expect(plan.hashes).toEqual({ 'a.ts': await sha256Hex(utf8('a!')) });
    expect(plan.versions).toEqual({ 'a.ts': model.getAlternativeVersionId() });
    expect(plan.structureVersion).toBe(0);
    expect(plan.paths).toEqual(['a.ts', 'b.ts']);
  });

  test('입력한 뒤 직접 지워 원본과 같아진 파일은 원본 복사다 (ADR-0009)', async () => {
    const workspace = await setup([['a.ts', 'a']]);
    await workspace.loadFile('a.ts');
    const model = workspace.registry.get('a.ts')!;
    typeInto(model, '!');
    model.pushEditOperations([], [{ range: new monaco.Range(1, 2, 1, 3), text: '' }], () => null);
    expect(workspace.registry.isDirty('a.ts')).toBe(true);
    const { plan, dirtyContents } = await workspace.createExportPlan();
    expect(plan.entries).toEqual([{ type: 'copy', path: 'a.ts', originalPath: 'a.ts' }]);
    expect(dirtyContents).toEqual({});
    expect(Object.keys(plan.hashes)).toEqual(['a.ts']);
  });

  test('UTF-16LE BOM 파일은 원래 인코딩으로 다시 쓴다', async () => {
    const workspace = await setup([['w.txt', utf16le('hi')]]);
    await workspace.loadFile('w.txt');
    typeInto(workspace.registry.get('w.txt')!, '!');
    const { dirtyContents } = await workspace.createExportPlan();
    const bytes = dirtyContents['w.txt']!;
    expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xfe]);
    expect(decodeText(bytes, 'utf-16le')).toBe('hi!');
  });

  test('새 파일은 늘 쓴다. 고치지 않았으면 빈 내용이다', async () => {
    const workspace = await setup([['a.ts', 'a']]);
    workspace.createEntry('', 'empty.ts', false);
    workspace.createEntry('', 'typed.ts', false);
    typeInto(workspace.registry.get('typed.ts')!, 'x');
    const { plan, dirtyContents } = await workspace.createExportPlan();
    expect(plan.entries).toEqual([
      { type: 'copy', path: 'a.ts', originalPath: 'a.ts' },
      { type: 'write', path: 'empty.ts' },
      { type: 'write', path: 'typed.ts' },
    ]);
    expect(dirtyContents['empty.ts']?.length).toBe(0);
    expect(text(dirtyContents['typed.ts'])).toBe('x');
  });

  test('이름을 바꾼 뒤 고친 파일의 쓰기에는 원래 경로가 있다 (ADR-0032)', async () => {
    const workspace = await setup([['run.sh', 'echo']]);
    await workspace.loadFile('run.sh');
    workspace.renameEntry('run.sh', 'start.sh');
    typeInto(workspace.registry.get('start.sh')!, '!');
    const { plan } = await workspace.createExportPlan();
    expect(plan.entries).toEqual([{ type: 'write', path: 'start.sh', originalPath: 'run.sh' }]);
  });

  test('바이트는 조각마다 버퍼를 따로 가지고, 계획은 순수 데이터다', async () => {
    const workspace = await setup([
      ['a.ts', 'a'],
      ['b.ts', 'b'],
    ]);
    for (const path of ['a.ts', 'b.ts']) {
      await workspace.loadFile(path);
      typeInto(workspace.registry.get(path)!, '!');
    }
    const request = await workspace.createExportPlan();
    for (const bytes of Object.values(request.dirtyContents)) {
      expect(bytes.byteOffset).toBe(0);
      expect(bytes.buffer.byteLength).toBe(bytes.byteLength);
    }
    expect(structuredClone(request.plan)).toEqual(request.plan);
  });
});

describe('다운로드 기록 (ADR-0025)', () => {
  test('받으면 받지 않은 변경이 없어지고, 더 고치면 다시 생긴다', async () => {
    const workspace = await setup([['a.ts', 'a']]);
    await workspace.loadFile('a.ts');
    const model = workspace.registry.get('a.ts')!;
    typeInto(model, '!');
    const { plan } = await workspace.createExportPlan();
    const record = workspace.markExported(plan);
    expect(record).toMatchObject({ files: plan.hashes, paths: ['a.ts'] });
    expect(typeof record.exportedAt).toBe('number');
    expect(workspace.downloadRecord()).toBe(record);
    expect(workspace.getUnexportedCount()).toBe(0);
    expect(workspace.registry.isDirty('a.ts')).toBe(true);
    typeInto(model, '?');
    expect(workspace.getUnexportedCount()).toBe(1);
  });

  test('받은 뒤 고친 파일이 든 폴더 이름만 바꾸면 받지 않은 변경은 1개다', async () => {
    const workspace = await setup([['d/x.ts', 'x']]);
    await workspace.loadFile('d/x.ts');
    workspace.registry.acquire('d/x.ts');
    typeInto(workspace.registry.get('d/x.ts')!, '!');
    workspace.markExported((await workspace.createExportPlan()).plan);
    workspace.renameEntry('d', 'e');
    expect(workspace.getUnexportedCount()).toBe(1);
    const { plan } = await workspace.createExportPlan();
    expect(plan.entries).toEqual([{ type: 'write', path: 'e/x.ts', originalPath: 'd/x.ts' }]);
  });
});

describe('스냅샷', () => {
  test('트리 변경, 고친 파일 내용, 다운로드 기록을 담는다', async () => {
    const workspace = await setup([
      ['a.ts', 'a'],
      ['b.ts', 'b'],
    ]);
    await workspace.loadFile('a.ts');
    await workspace.loadFile('b.ts');
    typeInto(workspace.registry.get('a.ts')!, '!');
    workspace.createEntry('', 'n.ts', false);
    const snapshot = await workspace.getSnapshot();
    expect(snapshot).toEqual({
      treeChanges: [{ type: 'add', path: 'n.ts', isDirectory: false }],
      contents: { 'a.ts': 'a!' },
      layout: null,
      downloadRecord: null,
    });
    expect(await workspace.getSnapshotFor(['a.ts', 'b.ts'])).toEqual({
      contents: { 'a.ts': 'a!' },
    });
  });
});

describe('복원 (ADR-0025)', () => {
  const items: Items = [
    ['src/a.ts', 'a'],
    ['src/b.ts', 'b'],
    ['README.md', 'r'],
  ];

  test('스냅샷으로 다시 만들면 트리·내용·수정 표시·받지 않은 변경이 같다', async () => {
    const live = await setup(items);
    await live.loadFile('src/a.ts');
    typeInto(live.registry.get('src/a.ts')!, '!');
    live.markExported((await live.createExportPlan()).plan);
    typeInto(live.registry.get('src/a.ts')!, '?');
    const snapshot = await live.getSnapshot();
    // Monaco model은 페이지 전역이다. 새로고침한 것처럼 먼저 치운다.
    live.dispose();

    const restored = await setup(items, snapshot);
    expect(restored.getDirtyPaths()).toEqual(['src/a.ts']);
    expect(restored.registry.get('src/a.ts')?.getValue()).toBe('a!?');
    expect(restored.store.getState().dirty).toEqual({ 'src/a.ts': true });
    expect(restored.getUnexportedCount()).toBe(1);
    expect(restored.downloadRecord()).toEqual(snapshot.downloadRecord);
  });

  test('받은 상태 그대로 새로고침하면 받지 않은 변경이 없다', async () => {
    const live = await setup(items);
    await live.loadFile('src/a.ts');
    typeInto(live.registry.get('src/a.ts')!, '!');
    live.renameEntry('README.md', 'README.txt');
    live.markExported((await live.createExportPlan()).plan);
    const snapshot = await live.getSnapshot();
    live.dispose();
    const restored = await setup(items, snapshot);
    expect(restored.getUnexportedCount()).toBe(0);
    expect(restored.tracker.state().has).toBe(false);
  });

  test('한 번도 받지 않았으면 고친 파일과 트리 변경을 받지 않은 변경으로 센다', async () => {
    const live = await setup(items);
    await live.loadFile('src/a.ts');
    typeInto(live.registry.get('src/a.ts')!, '!');
    live.createEntry('', 'n.ts', false);
    const snapshot = await live.getSnapshot();
    live.dispose();
    const restored = await setup(items, snapshot);
    expect(restored.getUnexportedCount()).toBe(2);
    expect(restored.hasChanges()).toBe(true);
  });

  test('복원한 파일은 undo로 원본에 돌아간다', async () => {
    const snapshot: WorkspaceSnapshot = {
      treeChanges: [],
      contents: { 'src/a.ts': 'changed' },
      layout: null,
      downloadRecord: null,
    };
    const restored = await setup(items, snapshot);
    const model = restored.registry.get('src/a.ts')!;
    expect(model.getValue()).toBe('changed');
    model.undo();
    expect(model.getValue()).toBe('a');
    expect(restored.registry.isDirty('src/a.ts')).toBe(false);
  });

  test('내용이 저장된 EUC-KR 파일은 UTF-8로 편집하고 UTF-8로 쓴다', async () => {
    const snapshot: WorkspaceSnapshot = {
      treeChanges: [],
      contents: { 'old.txt': `${KOREAN}!` },
      layout: null,
      downloadRecord: null,
    };
    const restored = await setup([['old.txt', eucKr(KOREAN)]], snapshot);
    expect(restored.textInfo('old.txt')).toMatchObject({ encoding: 'utf-8', readOnly: false });
    const { dirtyContents } = await restored.createExportPlan();
    expect(text(dirtyContents['old.txt'])).toBe(`${KOREAN}!`);
  });
});
