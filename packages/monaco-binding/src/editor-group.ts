import type * as api from 'monaco-editor/editor/editor.api.js';
import { ModelNotFoundError } from './errors';
import { redoKeybinding, undoKeybinding } from './keybindings';
import type { ModelRegistry } from './registry';
import type { CodeEditor, Disposable, EditorOptions, MonacoApi } from './types';

/**
 * dockview 그룹 하나의 에디터(ADR-0007). 탭을 바꿀 때 에디터를 새로 만들지 않고 model만 바꾸며,
 * 파일마다 커서·스크롤·접힘을 되살린다.
 */
export interface EditorGroup extends Disposable {
  /** 에디터 자체. 포커스, 크기 조절, 옵션 변경에 쓴다. model은 `show`·`clear`로만 바꾼다. */
  readonly editor: CodeEditor;
  /** 그 파일을 보인다. 등록부에 model이 있어야 한다. */
  show(path: string): void;
  /** 빈 에디터로 둔다. 보던 파일의 뷰 상태는 남긴다. */
  clear(): void;
  /** 이 그룹에서 그 파일의 탭이 닫혔다. 뷰 상태를 버린다. */
  forget(path: string): void;
  /** 지금 보이는 파일. */
  current(): string | undefined;
}

export interface EditorGroupOptions {
  /** Monaco 에디터 옵션. `model`은 무시한다. */
  readonly editorOptions?: EditorOptions;
}

/**
 * 그룹 에디터를 만든다. 등록부가 model을 새로 만들거나 지우면(이름 변경·되돌리기·삭제) 스스로 화면을 바꾼다.
 * `dispose`는 여러 번 불러도 된다(React StrictMode의 이중 마운트).
 */
export function createEditorGroup(
  monaco: MonacoApi,
  registry: ModelRegistry,
  container: HTMLElement,
  options: EditorGroupOptions = {},
): EditorGroup {
  const editor = monaco.editor.create(container, {
    automaticLayout: true,
    ...options.editorOptions,
    model: null,
  });
  // addCommand는 모든 에디터가 함께 쓰는 키바인딩 서비스에 조건 없이 등록돼, 마지막에 만든 에디터가 키를 가로챈다.
  // addAction은 그 에디터에 포커스가 있을 때만 걸리고, 지울 수 있는 등록을 돌려준다.
  // 실행은 editor.trigger('undo')가 아니라 이 에디터의 model에 직접 한다. trigger는 에디터가 여럿이면 다른 에디터 쪽으로 갈 수 있다.
  // model을 직접 부르면 에디터의 읽기 전용 설정을 건너뛰므로, 읽기 전용이면 아무것도 하지 않는다(ADR-0024).
  const editable = () => !editor.getOption(monaco.editor.EditorOption.readOnly);
  const actions: Disposable[] = [
    editor.addAction({
      id: 'codefold.undo',
      label: '실행 취소',
      keybindings: [undoKeybinding(monaco)],
      run: () => {
        if (editable()) void editor.getModel()?.undo();
      },
    }),
    editor.addAction({
      id: 'codefold.redo',
      label: '다시 실행',
      keybindings: [redoKeybinding(monaco)],
      run: () => {
        if (editable()) void editor.getModel()?.redo();
      },
    }),
  ];

  const viewStates = new Map<string, api.editor.ICodeEditorViewState>();
  let currentPath: string | undefined;
  let willDispose: Disposable | undefined;
  let disposed = false;

  const saveCurrent = () => {
    if (currentPath === undefined || !editor.getModel()) return;
    const state = editor.saveViewState();
    if (state) viewStates.set(currentPath, state);
  };

  const detach = () => {
    willDispose?.dispose();
    willDispose = undefined;
    currentPath = undefined;
  };

  const show = (path: string) => {
    const model = registry.get(path);
    if (!model) throw new ModelNotFoundError(path);
    saveCurrent();
    detach();
    currentPath = path;
    // model이 지워지기 직전(이름 변경·되돌리기·삭제)에 뷰 상태를 저장해 둔다. 에디터도 이 이벤트에서 model을
    // 떼어 내므로, 에디터보다 먼저 받도록 setModel 전에 구독한다.
    willDispose = model.onWillDispose(saveCurrent);
    editor.setModel(model);
    const state = viewStates.get(path);
    if (state) editor.restoreViewState(state);
  };

  const replaced = registry.onDidReplaceModel(({ from, to }) => {
    const state = viewStates.get(from);
    viewStates.delete(from);
    if (to !== undefined && state) viewStates.set(to, state);
    if (currentPath !== from) return;
    detach();
    if (to === undefined) {
      editor.setModel(null);
      return;
    }
    show(to);
  });

  return {
    editor,
    show,
    clear: () => {
      saveCurrent();
      detach();
      editor.setModel(null);
    },
    forget: (path) => {
      viewStates.delete(path);
    },
    current: () => currentPath,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      replaced.dispose();
      for (const action of actions) action.dispose();
      detach();
      // 에디터를 지워도 model은 등록부의 것이라 남긴다.
      editor.setModel(null);
      editor.dispose();
    },
  };
}
