import * as monaco from 'monaco-editor/editor/editor.api.js';
import { afterEach } from 'vitest';

// jsdom에는 matchMedia가 없다. Monaco가 에디터를 만들 때 고대비 설정을 확인하려고 부른다.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// jsdom에는 ResizeObserver도 없다. 에디터의 automaticLayout이 쓴다.
if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

// Monaco의 model과 에디터는 모듈 전역이라 테스트마다 치운다.
afterEach(() => {
  for (const editor of monaco.editor.getEditors()) editor.dispose();
  for (const model of monaco.editor.getModels()) model.dispose();
  document.body.replaceChildren();
});
