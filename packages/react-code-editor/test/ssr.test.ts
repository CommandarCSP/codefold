// @vitest-environment node
import { describe, expect, test } from 'vitest';

describe('서버 렌더링 안전성', () => {
  test('window가 없는 환경에서 패키지를 import해도 오류가 없다', async () => {
    expect(typeof window).toBe('undefined');
    const api = await import('../src/index');
    expect(typeof api.createEditorWorkspace).toBe('function');
  });

  test('서버 렌더링으로 그려도 오류 없이 불러오는 중 안내만 나온다', async () => {
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CodeEditor } = await import('../src/index');
    const source = {
      list: async () => [],
      readHead: async () => new Uint8Array(),
      readAll: async () => new Uint8Array(),
    };
    const html = renderToString(
      createElement(CodeEditor, { source, createWorker: () => ({}) as Worker }),
    );
    expect(html).toContain('에디터를 불러오는 중이에요');
  });
});
