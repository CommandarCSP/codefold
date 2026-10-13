import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { createModelRegistry } from '../src/registry';
import { createUnexportedTracker } from '../src/unexported';

const restoredWith = (changedPaths: string[]) => {
  const tracker = createUnexportedTracker(createModelRegistry(monaco));
  tracker.adoptRestoredExport({ versions: {}, changedPaths });
  return tracker;
};

describe('복원 때 받은 구조 차이 경로는 트리 변경을 따른다', () => {
  test('그 경로의 이름을 바꾸면 새 경로 하나로 센다', () => {
    const tracker = restoredWith(['new.py']);
    tracker.recordTreeChange({ type: 'rename', from: 'new.py', to: 'n2.py' }, 1);
    expect(tracker.paths()).toEqual(['n2.py']);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('그 경로가 든 폴더의 이름을 바꾸면 새 폴더 경로로 옮긴다', () => {
    const tracker = restoredWith(['d/new.py']);
    tracker.recordTreeChange({ type: 'rename', from: 'd', to: 'e' }, 1);
    expect([...tracker.paths()].sort()).toEqual(['e', 'e/new.py']);
  });

  test('그 경로를 지우면 삭제 하나로 센다', () => {
    const tracker = restoredWith(['new.py']);
    tracker.recordTreeChange({ type: 'rename', from: 'new.py', to: 'n2.py' }, 1);
    tracker.recordTreeChange({ type: 'delete', path: 'n2.py' }, 2);
    expect(tracker.paths()).toEqual(['n2.py']);
    expect(tracker.state()).toEqual({ has: true, count: 1 });
  });

  test('폴더를 지우면 그 안의 경로는 빠지고 폴더 하나로 센다', () => {
    const tracker = restoredWith(['d/a.py', 'd/b.py']);
    tracker.recordTreeChange({ type: 'delete', path: 'd' }, 1);
    expect(tracker.paths()).toEqual(['d']);
  });
});
