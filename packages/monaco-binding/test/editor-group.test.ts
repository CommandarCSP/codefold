import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test, vi } from 'vitest';
import { createEditorGroup } from '../src/editor-group';
import { ModelNotFoundError } from '../src/errors';
import { redoKeybinding, undoKeybinding } from '../src/keybindings';
import { createModelRegistry } from '../src/registry';
import type { CodeEditor } from '../src/types';
import { typeInto } from './helpers';

const container = () => {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
};

const setup = () => {
  const registry = createModelRegistry(monaco);
  registry.open('a.ts', 'line1\nline2\nline3');
  registry.open('b.ts', 'other');
  return registry;
};

describe('탭 전환', () => {
  test('에디터를 새로 만들지 않고 model만 바꾸며 커서를 되살린다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.editor.setPosition({ lineNumber: 3, column: 2 });
    group.show('b.ts');
    expect(group.editor.getModel()).toBe(registry.get('b.ts'));
    group.show('a.ts');
    expect(group.editor.getPosition()).toMatchObject({ lineNumber: 3, column: 2 });
    expect(monaco.editor.getEditors()).toHaveLength(1);
    expect(group.current()).toBe('a.ts');
  });

  test('forget하면 그 파일의 뷰 상태를 버린다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.editor.setPosition({ lineNumber: 3, column: 2 });
    group.show('b.ts');
    group.forget('a.ts');
    group.show('a.ts');
    expect(group.editor.getPosition()).toMatchObject({ lineNumber: 1, column: 1 });
  });

  test('model이 없는 경로는 ModelNotFoundError', () => {
    const group = createEditorGroup(monaco, setup(), container());
    expect(() => group.show('nope')).toThrow(ModelNotFoundError);
  });

  test('clear하면 빈 에디터가 되고 model은 남는다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.clear();
    expect(group.editor.getModel()).toBeNull();
    expect(group.current()).toBeUndefined();
    expect(registry.get('a.ts')?.isDisposed()).toBe(false);
  });
});

describe('파일별 undo', () => {
  test('탭을 오가도 파일마다 undo 기록이 따로 남는다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    typeInto(registry.get('a.ts')!, 'A');
    group.show('b.ts');
    typeInto(registry.get('b.ts')!, 'B');
    group.show('a.ts');
    group.editor.trigger('test', 'undo', null);
    expect(registry.get('a.ts')?.getValue()).toBe('line1\nline2\nline3');
    expect(registry.get('b.ts')?.getValue()).toBe('otherB');
  });
});

describe('분할', () => {
  test('두 그룹이 같은 파일을 보면 model 하나를 함께 쓴다', () => {
    const registry = setup();
    const left = createEditorGroup(monaco, registry, container());
    const right = createEditorGroup(monaco, registry, container());
    left.show('a.ts');
    right.show('a.ts');
    expect(left.editor.getModel()).toBe(right.editor.getModel());
    left.editor.trigger('test', 'type', { text: 'X' });
    expect(right.editor.getModel()?.getValue()).toBe(left.editor.getModel()?.getValue());
  });
});

describe('model이 바뀔 때', () => {
  test('보고 있는 파일의 이름을 바꾸면 새 model로 바뀌고 커서가 남는다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.editor.setPosition({ lineNumber: 2, column: 3 });
    registry.rename('a.ts', 'c.ts');
    expect(group.current()).toBe('c.ts');
    expect(group.editor.getModel()).toBe(registry.get('c.ts'));
    expect(group.editor.getPosition()).toMatchObject({ lineNumber: 2, column: 3 });
  });

  test('보지 않는 파일의 이름을 바꾸면 뷰 상태만 옮긴다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.editor.setPosition({ lineNumber: 2, column: 3 });
    group.show('b.ts');
    registry.rename('a.ts', 'c.ts');
    expect(group.current()).toBe('b.ts');
    group.show('c.ts');
    expect(group.editor.getPosition()).toMatchObject({ lineNumber: 2, column: 3 });
  });

  test('보고 있는 파일을 되돌리면 원본 model로 바뀐다', () => {
    const registry = setup();
    registry.acquire('a.ts');
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    typeInto(registry.get('a.ts')!, 'X');
    registry.revert('a.ts', 'line1\nline2\nline3');
    expect(group.editor.getModel()).toBe(registry.get('a.ts'));
    expect(group.editor.getModel()?.getValue()).toBe('line1\nline2\nline3');
  });

  test('보고 있는 파일을 지우면 빈 에디터가 된다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    registry.remove('a.ts');
    expect(group.editor.getModel()).toBeNull();
    expect(group.current()).toBeUndefined();
  });
});

describe('undo·redo 단축키', () => {
  test('에디터마다 CtrlCmd+Z는 undo, CtrlCmd+Shift+Z는 redo로 명시해서 등록한다', () => {
    const registered = new Map<number, () => void>();
    const subscription = monaco.editor.onDidCreateEditor((created) => {
      const editor = created as CodeEditor;
      const original = editor.addAction.bind(editor);
      vi.spyOn(editor, 'addAction').mockImplementation((descriptor) => {
        for (const keybinding of descriptor.keybindings ?? []) {
          registered.set(keybinding, () => void descriptor.run(editor));
        }
        return original(descriptor);
      });
    });
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    subscription.dispose();
    expect(undoKeybinding(monaco)).toBe(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ);
    expect(redoKeybinding(monaco)).toBe(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
    );
    expect([...registered.keys()].sort()).toEqual(
      [undoKeybinding(monaco), redoKeybinding(monaco)].sort(),
    );

    group.show('a.ts');
    const model = registry.get('a.ts')!;
    typeInto(model, 'X');
    registered.get(undoKeybinding(monaco))!();
    expect(model.getValue()).toBe('line1\nline2\nline3');
    registered.get(redoKeybinding(monaco))!();
    expect(model.getValue()).toBe('line1\nline2\nline3X');
  });
});

describe('읽기 전용 (ADR-0024)', () => {
  test('읽기 전용 에디터에서는 undo·redo 단축키가 내용을 바꾸지 않는다', async () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    const model = registry.get('a.ts')!;
    typeInto(model, 'X');
    group.editor.updateOptions({ readOnly: true });
    await group.editor.getAction('codefold.undo')?.run();
    expect(model.getValue()).toBe('line1\nline2\nline3X');
    group.editor.updateOptions({ readOnly: false });
    await group.editor.getAction('codefold.undo')?.run();
    group.editor.updateOptions({ readOnly: true });
    await group.editor.getAction('codefold.redo')?.run();
    expect(model.getValue()).toBe('line1\nline2\nline3');
  });
});

describe('수명 (StrictMode)', () => {
  test('만들었다 지우고 다시 만들어도 에디터는 하나이고, 두 번 지워도 오류가 없다', () => {
    const registry = setup();
    const element = container();
    const first = createEditorGroup(monaco, registry, element);
    first.dispose();
    const second = createEditorGroup(monaco, registry, element);
    expect(monaco.editor.getEditors()).toHaveLength(1);
    expect(() => first.dispose()).not.toThrow();
    second.dispose();
    expect(monaco.editor.getEditors()).toHaveLength(0);
  });

  test('그룹을 지워도 model은 지우지 않는다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.dispose();
    expect(registry.get('a.ts')?.isDisposed()).toBe(false);
  });

  test('지운 그룹은 등록부 알림을 받지 않는다', () => {
    const registry = setup();
    const group = createEditorGroup(monaco, registry, container());
    group.show('a.ts');
    group.dispose();
    expect(() => registry.rename('a.ts', 'c.ts')).not.toThrow();
  });
});
