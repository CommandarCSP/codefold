import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { createEditorGroup } from '../src/editor-group';
import { createModelRegistry } from '../src/registry';
import type { CodeEditor } from '../src/types';
import { createUnexportedTracker } from '../src/unexported';
import { typeInto } from './helpers';

const box = () => {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
};

// 키보드가 누른 키를 해석하는 것과 같은 길로, 이 에디터에서 우리 단축키가 어느 명령으로 가는지 찾아 실행한다.
// jsdom에서는 합성 키 이벤트가 Monaco에 닿지 않아 키바인딩 해석기를 직접 부른다(Monaco 내부 API, 테스트 전용).
async function pressIn(editor: CodeEditor, action: 'undo' | 'redo') {
  const internal = editor as unknown as {
    _standaloneKeybindingService: { _getResolver(): KeybindingResolver };
    _contextKeyService: { getContext(node: HTMLElement | null): unknown };
    _commandService: { executeCommand(id: string): Promise<unknown> };
  };
  interface KeybindingResolver {
    getKeybindings(): Array<{ command: string | null; chords: string[] }>;
    resolve(context: unknown, pending: string[], chord: string): { commandId?: string };
  }
  const resolver = internal._standaloneKeybindingService._getResolver();
  const item = resolver
    .getKeybindings()
    .find((i) => String(i.command).endsWith(`codefold.${action}`));
  if (!item) throw new Error(`단축키가 등록되지 않았다: ${action}`);
  const context = internal._contextKeyService.getContext(editor.getDomNode());
  const { commandId } = resolver.resolve(context, [], item.chords[0]!);
  if (!commandId) throw new Error('이 에디터에서 단축키가 어떤 명령으로도 가지 않는다');
  await internal._commandService.executeCommand(commandId);
}

describe('undo·redo 단축키는 자기 에디터에만', () => {
  test('두 그룹이 있어도 각 그룹의 Ctrl/Cmd+Z는 그 그룹의 파일만 되돌린다', async () => {
    const registry = createModelRegistry(monaco);
    registry.open('a.ts', 'A');
    registry.open('b.ts', 'B');
    const left = createEditorGroup(monaco, registry, box());
    const right = createEditorGroup(monaco, registry, box());
    left.show('a.ts');
    right.show('b.ts');
    typeInto(registry.get('a.ts')!, '1');
    typeInto(registry.get('b.ts')!, '2');
    await pressIn(left.editor, 'undo');
    expect(registry.get('a.ts')?.getValue()).toBe('A');
    expect(registry.get('b.ts')?.getValue()).toBe('B2');
    await pressIn(right.editor, 'undo');
    expect(registry.get('b.ts')?.getValue()).toBe('B');
    await pressIn(left.editor, 'redo');
    expect(registry.get('a.ts')?.getValue()).toBe('A1');
  });

  test('다른 그룹을 지워도 남은 그룹의 단축키가 동작한다', async () => {
    const registry = createModelRegistry(monaco);
    registry.open('a.ts', 'A');
    const left = createEditorGroup(monaco, registry, box());
    const right = createEditorGroup(monaco, registry, box());
    right.dispose();
    left.show('a.ts');
    typeInto(registry.get('a.ts')!, '1');
    await pressIn(left.editor, 'undo');
    expect(registry.get('a.ts')?.getValue()).toBe('A');
  });
});

describe('기록 버전은 그 model에서만 뜻이 있다', () => {
  test('되돌린 뒤 새 model의 버전이 우연히 기록과 같아져도 받지 않은 변경이다', () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    const model = registry.open('a.ts', 'a');
    registry.acquire('a.ts');
    typeInto(model, 'b');
    tracker.markExported(tracker.snapshot());
    registry.revert('a.ts', 'a');
    typeInto(registry.get('a.ts')!, 'Z');
    expect(registry.get('a.ts')?.getValue()).toBe('aZ');
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('받은 내용 그대로인 파일의 이름을 바꾸면 새 model에서도 받은 상태를 이어 간다', () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    const model = registry.open('a.ts', 'a');
    registry.acquire('a.ts');
    typeInto(model, 'b');
    tracker.markExported(tracker.snapshot());
    registry.rename('a.ts', 'b.ts');
    tracker.recordTreeChange({ type: 'rename', from: 'a.ts', to: 'b.ts' }, 1);
    const next = registry.get('b.ts')!;
    typeInto(next, 'c');
    expect(tracker.paths()).toEqual(['b.ts']);
    next.undo();
    expect(tracker.paths()).toEqual(['b.ts']);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });
});

describe('받을 때 입력 묶음을 끊는다', () => {
  test('이어서 입력한 뒤 받고 더 입력하면, undo로 받은 상태로 돌아갈 수 있다', () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    registry.open('a.ts', '');
    const group = createEditorGroup(monaco, registry, box());
    group.show('a.ts');
    group.editor.trigger('keyboard', 'type', { text: 'a' });
    group.editor.trigger('keyboard', 'type', { text: 'b' });
    tracker.markExported(tracker.snapshot());
    group.editor.trigger('keyboard', 'type', { text: 'c' });
    expect(tracker.state().has).toBe(true);
    group.editor.trigger('keyboard', 'undo', null);
    expect(registry.get('a.ts')?.getValue()).toBe('ab');
    expect(tracker.state()).toEqual({ has: false, count: 0 });
  });
});

describe('폴더 삭제·이름 변경은 1개로 센다', () => {
  const exportedFolder = () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    for (const name of ['x', 'y', 'z']) {
      const model = registry.open(`d/${name}.ts`, name);
      registry.acquire(`d/${name}.ts`);
      typeInto(model, '!');
    }
    tracker.markExported(tracker.snapshot());
    return { registry, tracker };
  };

  test('고친 파일 셋을 받은 뒤 폴더 이름을 바꾸면 1개다', () => {
    const { registry, tracker } = exportedFolder();
    for (const name of ['x', 'y', 'z']) registry.rename(`d/${name}.ts`, `e/${name}.ts`);
    tracker.recordTreeChange({ type: 'rename', from: 'd', to: 'e' }, 1);
    expect(tracker.paths()).toEqual(['e']);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('고친 파일 셋을 받은 뒤 폴더를 지우면 1개다', () => {
    const { registry, tracker } = exportedFolder();
    for (const name of ['x', 'y', 'z']) registry.remove(`d/${name}.ts`);
    tracker.recordTreeChange({ type: 'delete', path: 'd' }, 1);
    expect(tracker.paths()).toEqual(['d']);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('받은 뒤 폴더 안에 추가한 파일은 폴더 이름을 바꾸면 새 경로로 센다', () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    tracker.recordTreeChange({ type: 'add', path: 'd/new.ts' }, 1);
    tracker.recordTreeChange({ type: 'rename', from: 'd', to: 'e' }, 2);
    expect([...tracker.paths()].sort()).toEqual(['e', 'e/new.ts']);
  });
});

describe('다운로드 중 이름 변경', () => {
  test('계획을 만든 뒤 받기 전에 이름을 바꾸면 1개다', () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    const model = registry.open('a.ts', 'a');
    registry.acquire('a.ts');
    typeInto(model, 'b');
    const snapshot = tracker.snapshot();
    registry.rename('a.ts', 'b.ts');
    tracker.recordTreeChange({ type: 'rename', from: 'a.ts', to: 'b.ts' }, 1);
    tracker.markExported(snapshot);
    expect(tracker.paths()).toEqual(['b.ts']);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });
});
