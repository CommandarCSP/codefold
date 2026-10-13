import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { MonacoBindingError } from '../src/errors';
import type { ModelReplacedEvent } from '../src/registry';
import { createModelRegistry } from '../src/registry';
import { typeInto } from './helpers';

const setup = () => {
  const registry = createModelRegistry(monaco);
  const dirtyEvents: Array<[string, boolean]> = [];
  const replaced: ModelReplacedEvent[] = [];
  registry.onDirtyChange((path, dirty) => dirtyEvents.push([path, dirty]));
  registry.onDidReplaceModel((event) => replaced.push(event));
  return { registry, dirtyEvents, replaced };
};

describe('이름 변경', () => {
  test('새 URI로 model을 다시 만들어 내용을 옮기고 옛 model을 지운다', () => {
    const { registry, replaced } = setup();
    const old = registry.open('src/a.ts', 'const a = 1;');
    registry.acquire('src/a.ts');
    registry.rename('src/a.ts', 'src/b.ts');
    const next = registry.get('src/b.ts');
    expect(old.isDisposed()).toBe(true);
    expect(registry.get('src/a.ts')).toBeUndefined();
    expect(next?.uri.path).toBe('/src/b.ts');
    expect(next?.getValue()).toBe('const a = 1;');
    expect(replaced).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }]);
  });

  test('안 고친 파일은 새 이름에서도 안 고친 상태이고, 탭 수도 옮긴다', () => {
    const { registry } = setup();
    registry.open('a.ts', 'a');
    registry.acquire('a.ts');
    registry.rename('a.ts', 'b.ts');
    expect(registry.isDirty('b.ts')).toBe(false);
    const next = registry.get('b.ts')!;
    registry.release('b.ts');
    expect(next.isDisposed()).toBe(true);
  });

  test('고친 파일은 새 이름에서도 고친 상태이고, undo 기록은 끊겨 원본으로 돌아가지 않는다', () => {
    const { registry, dirtyEvents } = setup();
    const old = registry.open('a.ts', 'a');
    typeInto(old, 'b');
    registry.rename('a.ts', 'b.ts');
    expect(registry.isDirty('b.ts')).toBe(true);
    expect(dirtyEvents).toEqual([
      ['a.ts', true],
      ['a.ts', false],
      ['b.ts', true],
    ]);
    const next = registry.get('b.ts')!;
    expect(next.getValue()).toBe('ab');
    typeInto(next, 'c');
    next.undo();
    expect(registry.isDirty('b.ts')).toBe(true);
  });

  test('model이 없는 경로의 이름 변경은 아무것도 하지 않는다', () => {
    const { registry, replaced } = setup();
    registry.rename('a.ts', 'b.ts');
    expect(replaced).toEqual([]);
  });

  test('새 경로에 이미 model이 있으면 MonacoBindingError', () => {
    const { registry } = setup();
    registry.open('a.ts', 'a');
    registry.open('b.ts', 'b');
    expect(() => registry.rename('a.ts', 'b.ts')).toThrow(MonacoBindingError);
  });
});

describe('변경 되돌리기', () => {
  test('탭이 열려 있으면 원본 내용으로 새 model을 만들고 수정 표시를 거둔다', () => {
    const { registry, dirtyEvents, replaced } = setup();
    const old = registry.open('a.ts', 'a');
    registry.acquire('a.ts');
    typeInto(old, 'b');
    registry.revert('a.ts', 'a');
    const next = registry.get('a.ts')!;
    expect(old.isDisposed()).toBe(true);
    expect(next.getValue()).toBe('a');
    expect(next.canUndo()).toBe(false);
    expect(registry.isDirty('a.ts')).toBe(false);
    expect(dirtyEvents.at(-1)).toEqual(['a.ts', false]);
    expect(replaced).toEqual([{ from: 'a.ts', to: 'a.ts' }]);
    typeInto(next, 'z');
    expect(registry.isDirty('a.ts')).toBe(true);
  });

  test('탭이 없으면 model만 지운다', () => {
    const { registry, replaced } = setup();
    const old = registry.open('a.ts', 'a');
    typeInto(old, 'b');
    registry.revert('a.ts', 'a');
    expect(registry.get('a.ts')).toBeUndefined();
    expect(replaced).toEqual([{ from: 'a.ts', to: undefined }]);
  });
});
