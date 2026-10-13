import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 서버 렌더링 확인 테스트(node 환경)에서도 이 파일이 돈다. 그때는 브라우저 보충을 건너뛴다.
if (typeof window !== 'undefined') {
  // Monaco가 에디터를 만들 때 matchMedia를, automaticLayout이 ResizeObserver를 쓴다.
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
  // 가상화 트리는 스크롤 영역 크기로 보이는 행 수를 정한다. jsdom은 크기가 늘 0이라 트리 스크롤 영역만 300×480으로 둔다.
  for (const [prop, value] of [
    ['offsetHeight', 480],
    ['offsetWidth', 300],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('data-cf-viewport') ? value : 0;
      },
    });
  }
  // 가상화 목록은 scrollHeight로 스크롤할 수 있는 끝을 정한다. jsdom은 0이라, 트리 스크롤 영역은 안쪽 목록의 높이를 돌려준다.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.hasAttribute('data-cf-viewport')) return 0;
      const inner = this.firstElementChild;
      return inner instanceof HTMLElement ? Number.parseFloat(inner.style.height) || 0 : 0;
    },
  });
  // jsdom에 없는 스크롤·포인터 API. 가상화 목록(scrollTo)과 Radix 메뉴(포인터 캡처, scrollIntoView)가 쓴다.
  // jsdom의 canvas는 getContext가 null이라 Monaco 개요 눈금자가 그리다 멈춘다. 아무것도 하지 않는 2D 문맥으로 바꾼다.
  const noopContext = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'getImageData'
          ? () => ({ data: new Uint8ClampedArray(4) })
          : key === 'measureText'
            ? () => ({ width: 0 })
            : () => undefined,
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => noopContext) as never;

  // jsdom에 없는 object URL. 이미지 보기가 쓴다.
  let objectUrls = 0;
  URL.createObjectURL = () => {
    objectUrls += 1;
    return `blob:cf-test/${objectUrls}`;
  };
  URL.revokeObjectURL = () => undefined;

  Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
    const top = typeof options === 'number' ? undefined : options?.top;
    if (top !== undefined) this.scrollTop = top;
    this.dispatchEvent(new Event('scroll'));
  } as Element['scrollTo'];
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;

  const monaco = await import('monaco-editor/editor/editor.api.js');
  // Monaco의 model과 에디터는 모듈 전역이라 테스트마다 치운다.
  afterEach(() => {
    cleanup();
    for (const editor of monaco.editor.getEditors()) editor.dispose();
    for (const model of monaco.editor.getModels()) model.dispose();
    document.body.replaceChildren();
  });
}
