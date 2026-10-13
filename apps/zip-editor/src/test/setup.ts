import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Worker·IndexedDB 단위 테스트는 node 환경(@vitest-environment node)에서 돈다. 그때는 브라우저 보충을 건너뛴다.
if (typeof window !== 'undefined') {
  // 테마와 좁은 화면 판정이 matchMedia를 쓴다. jsdom에는 없다. 테스트가 바꿀 수 있게 writable로 두고(src/test/media.ts),
  // 테스트가 끝날 때마다 "맞지 않음"으로 되돌린다.
  const defaultMatchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: defaultMatchMedia,
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
  // Radix 메뉴·대화상자가 쓰는 포인터·스크롤 API. jsdom에 없다.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.matchMedia = defaultMatchMedia;
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
  });
}
