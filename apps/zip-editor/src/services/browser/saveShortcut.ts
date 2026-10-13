// apps/zip-editor/src/services/browser/saveShortcut.ts
import type { Disposable } from '@codefold/virtual-fs';

/**
 * Ctrl/Cmd+S. 처리기가 true를 돌려주면 브라우저 저장 창을 막는다.
 * Monaco가 먼저 받아 전파를 끊지 않도록 캡처 단계에서 듣는다.
 */
export function subscribeSaveShortcut(handler: () => boolean, target: Window = window): Disposable {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 's' || event.altKey || !(event.ctrlKey || event.metaKey))
      return;
    if (handler()) event.preventDefault();
  };
  target.addEventListener('keydown', onKeyDown, { capture: true });
  return { dispose: () => target.removeEventListener('keydown', onKeyDown, { capture: true }) };
}
