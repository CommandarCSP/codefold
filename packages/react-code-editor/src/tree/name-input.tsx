import { useEffect, useId, useRef, useState } from 'react';
import { nameProblemMessage, type CodeEditorMessages } from '../messages';
import type { EditorWorkspace } from '../workspace';
import type { NameInputRow } from './flatten';

export interface NameInputProps {
  readonly workspace: EditorWorkspace;
  readonly messages: CodeEditorMessages;
  readonly row: NameInputRow;
  /** 확정하거나 취소한 뒤 부른다. 포커스를 트리로 돌린다. */
  readonly onDone: () => void;
}

/**
 * 새 항목 이름과 새 이름을 받는 입력칸. Enter로 확정하고 Esc·포커스 이탈로 취소한다.
 * 잘못된 이름은 입력칸에서 막고 이유를 `aria-describedby`로 잇는다.
 */
export function NameInput({ workspace, messages, row, onDone }: NameInputProps) {
  const [value, setValue] = useState(row.mode === 'rename' ? row.name : '');
  const [submitted, setSubmitted] = useState(false);
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const { store, fs } = workspace;

  // 처음 그릴 때 한 번만 포커스한다. 이름을 바꿀 때는 확장자 앞까지 고른다.
  useEffect(() => {
    const element = input.current;
    if (focused.current || !element) return;
    focused.current = true;
    element.focus();
    if (row.mode === 'rename') {
      const dot = row.name.lastIndexOf('.');
      element.setSelectionRange(0, dot > 0 ? dot : row.name.length);
    }
  });

  const problem =
    row.mode === 'create'
      ? fs.validateNewName(row.parentPath, value)
      : fs.validateRename(row.path, value);
  // 빈 이름은 Enter를 누른 뒤에만 알린다. 막 연 입력칸이 처음부터 오류로 보이지 않게 한다.
  const shown = problem === 'empty' && !submitted ? undefined : problem;

  const finish = () => {
    store.getState().stopEditing();
    onDone();
  };

  const commit = () => {
    setSubmitted(true);
    if (problem) return;
    finish();
    if (row.mode === 'rename') {
      workspace.renameEntry(row.path, value);
      return;
    }
    const node = workspace.createEntry(row.parentPath, value, row.isDirectory);
    store.getState().setFocused(node.path);
    if (!node.isDirectory) {
      // 새 파일은 바로 탭으로 열고 에디터로 포커스를 옮긴다.
      workspace.openFile(node.path);
      workspace.focusEditor(node.path);
    }
  };

  const label =
    row.mode === 'rename'
      ? messages.renameInputLabel
      : row.isDirectory
        ? messages.newFolderInputLabel
        : messages.newFileInputLabel;

  return (
    <span className="cf:relative cf:flex cf:min-w-0 cf:flex-1">
      <input
        ref={input}
        aria-label={label}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? errorId : undefined}
        value={value}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // 트리의 키 처리(화살표, F2, Delete)로 새지 않게 한다.
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            finish();
          }
        }}
        onBlur={(event) => {
          // 다른 곳을 누르면 취소하되, 포커스는 사용자가 누른 곳에 둔다.
          // 창 자체를 떠나면(다른 앱으로 전환) 입력칸이 계속 활성 요소로 남는다. 그때는 취소하지 않는다.
          const element = event.currentTarget;
          queueMicrotask(() => {
            if (document.activeElement === element) return;
            if (store.getState().editing) store.getState().stopEditing();
          });
        }}
        className="cf:h-5 cf:min-w-0 cf:flex-1 cf:rounded-sm cf:border cf:border-ring cf:bg-background cf:px-1 cf:text-sm cf:text-foreground cf:outline-none cf:aria-invalid:border-destructive"
      />
      {shown && (
        <span
          id={errorId}
          role="alert"
          className="cf:absolute cf:inset-x-0 cf:top-full cf:mt-0.5 cf:rounded-sm cf:bg-destructive cf:px-1.5 cf:py-0.5 cf:text-xs cf:whitespace-normal cf:text-primary-foreground cf:shadow-md"
        >
          {nameProblemMessage(messages, shown)}
        </span>
      )}
    </span>
  );
}
