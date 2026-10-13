// apps/zip-editor/src/services/browser/fileDrag.ts
import type { Disposable } from '@codefold/virtual-fs';

export interface FileDragHandlers {
  /** 지금 놓을 수 있나. 아니면 놓기 영역을 띄우지 않고 놓아도 무시한다. */
  canDrop(): boolean;
  onActiveChange(active: boolean): void;
  onDrop(files: File[]): void;
}

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

/**
 * 브라우저 밖에서 끌어 온 파일에만 반응한다. dockview 탭이나 트리 항목처럼 화면 안의 것을 끌면
 * `dataTransfer.types`에 `Files`가 없어 무시한다. 파일을 끌 때는 놓을 수 없어도 브라우저가 파일을 여는 기본 동작을 막는다.
 */
export function subscribeFileDrag(target: Window, handlers: FileDragHandlers): Disposable {
  let depth = 0;
  let active = false;
  const setActive = (next: boolean) => {
    if (next === active) return;
    active = next;
    handlers.onActiveChange(next);
  };
  const onEnter = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth += 1;
    if (handlers.canDrop()) setActive(true);
  };
  const onOver = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = handlers.canDrop() ? 'copy' : 'none';
  };
  const onLeave = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) setActive(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    setActive(false);
    if (handlers.canDrop()) handlers.onDrop([...(event.dataTransfer?.files ?? [])]);
  };
  target.addEventListener('dragenter', onEnter);
  target.addEventListener('dragover', onOver);
  target.addEventListener('dragleave', onLeave);
  target.addEventListener('drop', onDrop);
  return {
    dispose: () => {
      target.removeEventListener('dragenter', onEnter);
      target.removeEventListener('dragover', onOver);
      target.removeEventListener('dragleave', onLeave);
      target.removeEventListener('drop', onDrop);
    },
  };
}
