// apps/zip-editor/src/services/browser/__tests__/fileDrag.unit.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { subscribeFileDrag } from '../fileDrag';

function drag(type: string, types: string[], files: File[] = []) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types, files, dropEffect: 'none' } });
  window.dispatchEvent(event);
  return event;
}

let dispose: (() => void) | undefined;
afterEach(() => dispose?.());

function subscribe(canDrop = true) {
  const onActiveChange = vi.fn();
  const onDrop = vi.fn();
  const subscription = subscribeFileDrag(window, {
    canDrop: () => canDrop,
    onActiveChange,
    onDrop,
  });
  dispose = () => subscription.dispose();
  return { onActiveChange, onDrop };
}

describe('끌어 놓기', () => {
  test('파일을 끌어 오면 놓기 영역을 켜고, 놓으면 끄고 파일을 넘긴다', () => {
    const { onActiveChange, onDrop } = subscribe();
    const file = new File(['PK'], 'a.zip');
    expect(drag('dragenter', ['Files'], [file]).defaultPrevented).toBe(true);
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    expect(drag('dragover', ['Files']).defaultPrevented).toBe(true);
    drag('drop', ['Files'], [file]);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    expect(onDrop).toHaveBeenCalledWith([file]);
  });

  test('자식 요소를 오가며 나는 enter·leave에도 한 번만 켜고, 다 나가면 끈다', () => {
    const { onActiveChange } = subscribe();
    drag('dragenter', ['Files']);
    drag('dragenter', ['Files']);
    drag('dragleave', ['Files']);
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    drag('dragleave', ['Files']);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  test('화면 안의 것(탭·트리 항목)을 끌면 반응하지 않는다', () => {
    const { onActiveChange } = subscribe();
    expect(drag('dragenter', ['text/plain']).defaultPrevented).toBe(false);
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  test('놓을 수 없을 때는 놓기 영역을 띄우지 않고 놓아도 무시하지만, 브라우저가 파일을 여는 것은 막는다', () => {
    const { onActiveChange, onDrop } = subscribe(false);
    drag('dragenter', ['Files']);
    expect(onActiveChange).not.toHaveBeenCalled();
    expect(drag('drop', ['Files'], [new File([], 'a.zip')]).defaultPrevented).toBe(true);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
