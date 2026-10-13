import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { ModelNotFoundError } from '../src/errors';
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

describe('열기', () => {
  test('파일마다 model 하나, URI는 file:///경로', () => {
    const { registry } = setup();
    const a = registry.open('src/한글 파일.ts', 'const a = 1;');
    const b = registry.open('src/한글  파일.ts', 'const b = 2;');
    expect(a.uri.toString()).toBe(monaco.Uri.file('/src/한글 파일.ts').toString());
    expect(a.uri.path).toBe('/src/한글 파일.ts');
    expect(b.uri.path).toBe('/src/한글  파일.ts');
    expect(registry.open('src/한글 파일.ts', '무시되는 내용')).toBe(a);
    expect(a.getValue()).toBe('const a = 1;');
    expect(registry.get('src/한글 파일.ts')).toBe(a);
    expect(registry.get('nope')).toBeUndefined();
  });

  test('처음에는 수정되지 않았다', () => {
    const { registry } = setup();
    registry.open('a.txt', 'a');
    expect(registry.isDirty('a.txt')).toBe(false);
    expect(registry.dirtyPaths()).toEqual([]);
  });
});

describe('수정 여부', () => {
  test('첫 입력에서 한 번, 이어지는 입력에서는 알리지 않고, undo로 원본과 같아지면 한 번 더', () => {
    const { registry, dirtyEvents } = setup();
    const model = registry.open('a.txt', 'a');
    typeInto(model, 'b');
    typeInto(model, 'c');
    typeInto(model, 'd');
    expect(dirtyEvents).toEqual([['a.txt', true]]);
    expect(registry.isDirty('a.txt')).toBe(true);
    expect(registry.dirtyPaths()).toEqual(['a.txt']);
    model.undo();
    model.undo();
    expect(dirtyEvents).toEqual([['a.txt', true]]);
    model.undo();
    expect(dirtyEvents).toEqual([
      ['a.txt', true],
      ['a.txt', false],
    ]);
    model.redo();
    expect(dirtyEvents.at(-1)).toEqual(['a.txt', true]);
  });

  test('입력 1000번에 알림은 한 번이다', () => {
    const { registry, dirtyEvents } = setup();
    const model = registry.open('a.txt', '');
    for (let i = 0; i < 1000; i += 1) typeInto(model, 'x');
    expect(dirtyEvents).toHaveLength(1);
  });
});

describe('탭 수와 model 수명', () => {
  test('안 고친 파일은 마지막 탭이 닫히면 지운다', () => {
    const { registry, replaced } = setup();
    const model = registry.open('a.txt', 'a');
    registry.acquire('a.txt');
    registry.release('a.txt');
    expect(model.isDisposed()).toBe(true);
    expect(registry.get('a.txt')).toBeUndefined();
    expect(replaced).toEqual([{ from: 'a.txt', to: undefined }]);
  });

  test('같은 파일이 다른 그룹에 열려 있으면 지우지 않는다', () => {
    const { registry } = setup();
    const model = registry.open('a.txt', 'a');
    registry.acquire('a.txt');
    registry.acquire('a.txt');
    registry.release('a.txt');
    expect(model.isDisposed()).toBe(false);
    registry.release('a.txt');
    expect(model.isDisposed()).toBe(true);
  });

  test('고친 파일은 탭을 닫아도 남고, 다시 열면 내용과 undo 기록이 이어진다', () => {
    const { registry } = setup();
    const model = registry.open('a.txt', 'a');
    registry.acquire('a.txt');
    typeInto(model, 'b');
    registry.release('a.txt');
    expect(model.isDisposed()).toBe(false);
    registry.acquire('a.txt');
    expect(registry.open('a.txt', '원본')).toBe(model);
    model.undo();
    expect(model.getValue()).toBe('a');
    expect(registry.isDirty('a.txt')).toBe(false);
  });

  test('없는 model에 탭을 붙이면 ModelNotFoundError, 없는 model을 놓는 것은 무시한다', () => {
    const { registry } = setup();
    expect(() => registry.acquire('nope')).toThrow(ModelNotFoundError);
    expect(() => registry.release('nope')).not.toThrow();
  });
});

describe('삭제', () => {
  test('고친 파일도 지우고, 수정 표시를 거둔다', () => {
    const { registry, dirtyEvents, replaced } = setup();
    const model = registry.open('a.txt', 'a');
    registry.acquire('a.txt');
    typeInto(model, 'b');
    registry.remove('a.txt');
    expect(model.isDisposed()).toBe(true);
    expect(registry.isDirty('a.txt')).toBe(false);
    expect(dirtyEvents).toEqual([
      ['a.txt', true],
      ['a.txt', false],
    ]);
    expect(replaced).toEqual([{ from: 'a.txt', to: undefined }]);
  });

  test('model이 없는 경로를 지우는 것은 무시한다', () => {
    const { registry, replaced } = setup();
    registry.remove('nope');
    expect(replaced).toEqual([]);
  });
});

describe('정리', () => {
  test('dispose하면 모든 model을 지우고 더 알리지 않는다', () => {
    const { registry, dirtyEvents } = setup();
    const model = registry.open('a.txt', 'a');
    registry.dispose();
    expect(model.isDisposed()).toBe(true);
    expect(dirtyEvents).toEqual([]);
    expect(() => registry.dispose()).not.toThrow();
  });
});
