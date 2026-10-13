import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import * as binding from '../src/index';

describe('공개 API', () => {
  test('함수와 오류 class만 값으로 내보낸다', () => {
    expect(Object.keys(binding).sort()).toEqual([
      'ModelNotFoundError',
      'MonacoBindingError',
      'createEditorGroup',
      'createModelRegistry',
      'createUnexportedTracker',
      'createWorkerEnvironment',
      'redoKeybinding',
      'undoKeybinding',
    ]);
  });

  test('등록부·추적기·그룹을 함께 써도 전역 MonacoEnvironment는 그대로다', () => {
    const registry = binding.createModelRegistry(monaco);
    const tracker = binding.createUnexportedTracker(registry);
    registry.open('a.ts', 'a');
    const element = document.createElement('div');
    document.body.append(element);
    const group = binding.createEditorGroup(monaco, registry, element);
    group.show('a.ts');
    expect('MonacoEnvironment' in globalThis).toBe(false);
    group.dispose();
    tracker.dispose();
    registry.dispose();
  });

  test('메서드를 떼어 콜백으로 넘겨도 동작한다 (ADR-0017)', () => {
    const registry = binding.createModelRegistry(monaco);
    const { open, isDirty } = registry;
    open('a.ts', 'a');
    expect(isDirty('a.ts')).toBe(false);
  });
});
