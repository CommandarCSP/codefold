import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import * as api from '../src/index';
import { memorySource } from './helpers';

describe('공개 API', () => {
  test('함수·컴포넌트·오류만 값으로 내보낸다', () => {
    expect(Object.keys(api).sort()).toEqual([
      'CodeEditor',
      'CodeEditorError',
      'EditorArea',
      'FileChangedError',
      'FileTree',
      'FileTreePanel',
      'NotTextFileError',
      'createEditorWorkspace',
      'defaultMessages',
      'formatMessage',
      'resolveMessages',
    ]);
  });

  test('작업 공간 메서드를 떼어 콜백으로 넘겨도 동작한다 (ADR-0017)', async () => {
    const workspace = await api.createEditorWorkspace({
      source: memorySource([['a.ts', 'a']]),
      monaco,
    });
    const { createEntry, hasChanges, getDirtyPaths } = workspace;
    createEntry('', 'b.ts', false);
    expect(hasChanges()).toBe(true);
    expect(getDirtyPaths()).toEqual([]);
  });
});
