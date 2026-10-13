// apps/zip-editor/src/services/browser/pageLifecycle.ts
import type { Disposable } from '@codefold/virtual-fs';

/** 새로고침·닫기 경고. 문구는 브라우저 기본값이다(ADR-0014). */
export function subscribeBeforeUnload(
  shouldWarn: () => boolean,
  target: Window = window,
): Disposable {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!shouldWarn()) return;
    event.preventDefault();
    // 예전 방식만 아는 브라우저를 위해 함께 둔다.
    event.returnValue = '';
  };
  target.addEventListener('beforeunload', onBeforeUnload);
  return { dispose: () => target.removeEventListener('beforeunload', onBeforeUnload) };
}

/**
 * 탭이 숨겨질 때. 모바일과 탭 전환에서는 beforeunload보다 확실하게 일어난다.
 * 페이지를 떠날 때 visibilitychange를 빠뜨리는 브라우저(옛 Safari 등)를 위해 pagehide에도 부른다.
 * 둘 다 오면 두 번 부르지만, 두 번째 저장은 쓸 것이 없어 바로 끝난다.
 */
export function subscribeVisibilityHidden(
  handler: () => void,
  doc: Document = document,
): Disposable {
  const target = doc.defaultView;
  const onChange = () => {
    if (doc.visibilityState === 'hidden') handler();
  };
  const onPageHide = () => handler();
  doc.addEventListener('visibilitychange', onChange);
  target?.addEventListener('pagehide', onPageHide);
  return {
    dispose: () => {
      doc.removeEventListener('visibilitychange', onChange);
      target?.removeEventListener('pagehide', onPageHide);
    },
  };
}
