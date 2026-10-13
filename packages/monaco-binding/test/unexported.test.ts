import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { createModelRegistry } from '../src/registry';
import type { UnexportedState } from '../src/types';
import { createUnexportedTracker } from '../src/unexported';
import { typeInto } from './helpers';

const setup = () => {
  const registry = createModelRegistry(monaco);
  const tracker = createUnexportedTracker(registry);
  const events: UnexportedState[] = [];
  tracker.onChange((state) => events.push(state));
  return { registry, tracker, events };
};

const NONE = { has: false, count: 0 };

describe('한 번도 받지 않았을 때', () => {
  test('고친 파일이 있으면 참이고, undo로 원본이 되면 거짓이다', () => {
    const { registry, tracker, events } = setup();
    const model = registry.open('a.ts', 'a');
    expect(tracker.state()).toEqual(NONE);
    typeInto(model, 'b');
    typeInto(model, 'c');
    expect(tracker.state()).toEqual({ has: true, count: 1 });
    model.undo();
    model.undo();
    expect(tracker.state()).toEqual(NONE);
    expect(events).toEqual([{ has: true, count: 1 }, NONE]);
  });

  test('구조 변경만 있어도 참이다', () => {
    const { tracker } = setup();
    tracker.recordTreeChange({ type: 'add', path: 'new.ts' }, 1);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
    expect(tracker.paths()).toEqual(['new.ts']);
  });
});

describe('받은 뒤 (ADR-0009의 네 조건)', () => {
  const exported = () => {
    const ctx = setup();
    const model = ctx.registry.open('a.ts', 'a');
    ctx.registry.acquire('a.ts');
    typeInto(model, 'b');
    ctx.tracker.markExported(ctx.tracker.snapshot());
    ctx.events.length = 0;
    return { ...ctx, model };
  };

  test('받은 직후에는 거짓이고 수정 표시는 그대로다', () => {
    const { registry, tracker } = exported();
    expect(tracker.state()).toEqual(NONE);
    expect(registry.isDirty('a.ts')).toBe(true);
  });

  test('1) 기록에 있는 파일의 버전이 달라지면 참, undo로 받은 상태로 돌아가면 거짓이다', () => {
    const { tracker, model, events } = exported();
    typeInto(model, 'c');
    typeInto(model, 'd');
    expect(tracker.state()).toEqual({ has: true, count: 1 });
    model.undo();
    model.undo();
    expect(tracker.state()).toEqual(NONE);
    expect(events).toEqual([{ has: true, count: 1 }, NONE]);
  });

  test('2) 기록에 있는 파일을 원본으로 되돌리면 참이다', () => {
    const { registry, tracker } = exported();
    registry.revert('a.ts', 'a');
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('2) 기록에 있는 파일을 undo로 원본까지 돌려도 참이다', () => {
    const { tracker, model } = exported();
    model.undo();
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('3) 기록에 없는 파일을 새로 고치면 참이다', () => {
    const { registry, tracker } = exported();
    typeInto(registry.open('b.ts', 'b'), 'x');
    expect(tracker.state()).toEqual({ has: true, count: 1 });
    expect(tracker.paths()).toEqual(['b.ts']);
  });

  test('4) 구조 버전이 달라지면 참이다', () => {
    const { tracker } = exported();
    tracker.recordTreeChange({ type: 'delete', path: 'old.ts' }, 1);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });
});

describe('개수', () => {
  test('고친 파일을 받은 뒤 이름만 바꾸면 1개다', () => {
    const { registry, tracker } = setup();
    typeInto(registry.open('a.ts', 'a'), 'b');
    tracker.markExported(tracker.snapshot());
    registry.rename('a.ts', 'b.ts');
    tracker.recordTreeChange({ type: 'rename', from: 'a.ts', to: 'b.ts' }, 1);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
    expect(tracker.paths()).toEqual(['b.ts']);
  });

  test('받은 뒤 추가한 파일의 이름을 바꾸면 1개다', () => {
    const { tracker } = setup();
    tracker.markExported(tracker.snapshot());
    tracker.recordTreeChange({ type: 'add', path: 'new.ts' }, 1);
    tracker.recordTreeChange({ type: 'rename', from: 'new.ts', to: 'renamed.ts' }, 2);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('이미 받지 않은 변경인 파일에서 계속 입력하면 알림이 없다', () => {
    const { registry, tracker, events } = setup();
    const model = registry.open('a.ts', 'a');
    for (let i = 0; i < 100; i += 1) typeInto(model, 'x');
    expect(events).toHaveLength(1);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('경로가 들고 날 때마다 개수를 다시 센다', () => {
    const { registry, tracker, events } = setup();
    typeInto(registry.open('a.ts', 'a'), 'x');
    typeInto(registry.open('b.ts', 'b'), 'x');
    tracker.recordTreeChange({ type: 'add', path: 'c.ts' }, 1);
    expect(events.map((e) => e.count)).toEqual([1, 2, 3]);
  });
});

describe('다운로드 중 변경', () => {
  test('계획을 만든 뒤 받기 전에 고친 내용은 받지 않은 변경으로 남는다', () => {
    const { registry, tracker } = setup();
    const model = registry.open('a.ts', 'a');
    typeInto(model, 'b');
    const snapshot = tracker.snapshot();
    typeInto(model, 'c');
    tracker.recordTreeChange({ type: 'add', path: 'late.ts' }, 1);
    tracker.markExported(snapshot);
    expect(tracker.state()).toEqual({ has: true, count: 2 });
  });

  test('snapshot은 고친 파일만 버전을 담는다', () => {
    const { registry, tracker } = setup();
    registry.open('clean.ts', 'c');
    const dirty = registry.open('dirty.ts', 'd');
    typeInto(dirty, 'x');
    tracker.recordTreeChange({ type: 'add', path: 'n.ts' }, 3);
    expect(tracker.snapshot()).toEqual({
      versions: { 'dirty.ts': dirty.getAlternativeVersionId() },
      structureVersion: 3,
    });
  });
});

describe('복원 뒤 기록 옮기기 (ADR-0025)', () => {
  test('지문이 같은 파일은 받은 것으로, 구조가 다른 경로는 받지 않은 변경으로 센다', () => {
    const { registry, tracker } = setup();
    const same = registry.open('same.ts', 's');
    typeInto(same, 'x');
    typeInto(registry.open('changed.ts', 'c'), 'x');
    tracker.adoptRestoredExport({
      versions: { 'same.ts': same.getAlternativeVersionId() },
      changedPaths: ['added-after-export.ts'],
    });
    expect([...tracker.paths()].sort()).toEqual(['added-after-export.ts', 'changed.ts']);
    expect(tracker.state()).toEqual({ has: true, count: 2 });
  });

  test('모두 같으면 거짓이다', () => {
    const { registry, tracker } = setup();
    const same = registry.open('same.ts', 's');
    typeInto(same, 'x');
    tracker.adoptRestoredExport({
      versions: { 'same.ts': same.getAlternativeVersionId() },
      changedPaths: [],
    });
    expect(tracker.state()).toEqual(NONE);
  });
});

describe('입력 비용', () => {
  test('기록에 없는 파일에 입력할 때 추적기는 버전을 더 읽지 않는다', () => {
    const { registry, tracker } = setup();
    typeInto(registry.open('recorded.ts', 'r'), 'x');
    tracker.markExported(tracker.snapshot());
    const other = registry.open('other.ts', 'o');
    typeInto(other, 'x');
    let reads = 0;
    const original = other.getAlternativeVersionId.bind(other);
    other.getAlternativeVersionId = () => {
      reads += 1;
      return original();
    };
    const countReads = () => {
      reads = 0;
      for (let i = 0; i < 50; i += 1) typeInto(other, 'y');
      return reads;
    };
    const withTracker = countReads();
    tracker.dispose();
    const withoutTracker = countReads();
    // Monaco 내부와 등록부도 버전을 읽으므로 절대값이 아니라 추적기가 있을 때와 없을 때를 비교한다.
    expect(withTracker).toBe(withoutTracker);
  });
});
