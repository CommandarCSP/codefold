import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { ModelNotFoundError } from '../src/errors';
import { createModelRegistry } from '../src/registry';
import { createUnexportedTracker } from '../src/unexported';
import { typeInto } from './helpers';

describe('markDirty', () => {
  test('내용은 그대로 두고 고친 상태로 만들며, undo로도 원본 상태가 되지 않는다', () => {
    const registry = createModelRegistry(monaco);
    const tracker = createUnexportedTracker(registry);
    const events: Array<[string, boolean]> = [];
    registry.onDirtyChange((path, dirty) => events.push([path, dirty]));
    const model = registry.open('old.txt', '안녕');
    registry.markDirty('old.txt');
    expect(model.getValue()).toBe('안녕');
    expect(registry.isDirty('old.txt')).toBe(true);
    expect(events).toEqual([['old.txt', true]]);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
    typeInto(model, '!');
    model.undo();
    expect(registry.isDirty('old.txt')).toBe(true);
  });

  test('model이 없으면 ModelNotFoundError', () => {
    expect(() => createModelRegistry(monaco).markDirty('nope')).toThrow(ModelNotFoundError);
  });
});
