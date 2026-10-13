import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useStore } from 'zustand';
import { cn } from '../cn';
import type { CodeEditorMessages } from '../messages';
import type { EditingState } from '../store';
import type { EditorWorkspace } from '../workspace';
import { flattenTree, rowKey, type NameInputRow, type TreeRowData } from './flatten';
import { indentOf, TREE_ROW_HEIGHT } from './layout';
import { TreeRow } from './tree-row';

export interface FileTreeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  readonly workspace: EditorWorkspace;
  readonly messages: CodeEditorMessages;
  /** 포커스된 행에서 F2를 눌렀다. */
  readonly onRequestRename?: (path: string) => void;
  /** 포커스된 행에서 Delete를 눌렀다. */
  readonly onRequestDelete?: (path: string) => void;
  /** 이름을 입력하는 행에 그릴 입력칸. */
  readonly renderNameInput?: (row: NameInputRow) => ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * 가상화된 파일 트리(ADR-0029). 펼친 폴더만 한 줄 목록으로 만들고, 보이는 행만 그린다.
 * 키보드 포커스는 트리 컨테이너에 두고 활성 행은 `aria-activedescendant`로 가리킨다.
 */
export function FileTree({ workspace, ...props }: FileTreeProps) {
  const { store, fs } = workspace;
  const expanded = useStore(store, (state) => state.expanded);
  const editing = useStore(store, (state) => state.editing);
  const structureVersion = useStore(store, (state) => state.structureVersion);
  const rows = flattenTree(fs, expanded, editing, structureVersion);
  return <TreeViewport {...props} workspace={workspace} rows={rows} />;
}

interface TreeViewportProps extends Omit<FileTreeProps, 'workspace'> {
  readonly workspace: EditorWorkspace;
  readonly rows: readonly TreeRowData[];
}

const rowId = (baseId: string, path: string) => `${baseId}-${encodeURIComponent(path)}`;

function TreeViewport({
  workspace,
  rows,
  messages,
  onRequestRename,
  onRequestDelete,
  renderNameInput,
  className,
  ref,
  onKeyDown,
  ...rest
}: TreeViewportProps) {
  // useVirtualizer는 같은 객체를 고쳐 쓰는 API라 React Compiler의 메모이제이션과 맞지 않는다(ADR-0019의 예외).
  'use no memo';
  const { store } = workspace;
  const focusedPath = useStore(store, (state) => state.focusedPath);
  const activePath = useStore(store, (state) => state.activePath);
  const editing = useStore(store, (state) => state.editing);
  const readOnly = useStore(store, (state) => state.readOnly);
  const viewport = useRef<HTMLDivElement | null>(null);
  const scrolledTo = useRef<{ focused?: string; active?: string; editing?: EditingState }>({});
  const baseId = useId();
  // 위의 'use no memo'로 이 컴포넌트는 컴파일러가 건너뛴다. 린트가 같은 사실을 경고로 알려 끈다.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => rowKey(rows[index]!),
  });

  const indexOf = (path: string | undefined) =>
    path === undefined
      ? -1
      : rows.findIndex((row) => row.type === 'node' && row.node.path === path);
  const focusedIndex = indexOf(focusedPath);
  const activeIndex = indexOf(activePath);
  const editingIndex =
    editing?.mode === 'create'
      ? rows.findIndex((row) => row.type === 'create')
      : editing?.mode === 'rename'
        ? indexOf(editing.path)
        : -1;

  // 포커스 행이 바뀌면 그 행까지 스크롤한다. 그 행이 그려진 다음 렌더에서 aria-activedescendant가 그 행을 가리킨다.
  // 활성 탭이 바뀌면 부모 폴더가 펼쳐진 뒤 그 행까지 한 번 스크롤한다. 트리 포커스는 옮기지 않는다.
  useEffect(() => {
    if (focusedIndex >= 0 && scrolledTo.current.focused !== focusedPath) {
      scrolledTo.current.focused = focusedPath;
      virtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
    }
    if (activeIndex >= 0 && scrolledTo.current.active !== activePath) {
      scrolledTo.current.active = activePath;
      virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
    }
    // 이름 입력 행이 화면 밖이면 그 행까지 스크롤해 입력칸이 그려지게 한다.
    if (editingIndex >= 0 && scrolledTo.current.editing !== editing) {
      scrolledTo.current.editing = editing;
      virtualizer.scrollToIndex(editingIndex, { align: 'auto' });
    }
  });

  const items = virtualizer.getVirtualItems();
  const focusedRendered = items.some((item) => item.index === focusedIndex);

  const nodeAt = (index: number) => {
    const row = rows[index];
    return row?.type === 'node' ? row : undefined;
  };
  const focusFrom = (index: number, step: 1 | -1) => {
    for (let i = index; i >= 0 && i < rows.length; i += step) {
      const row = nodeAt(i);
      if (row) {
        store.getState().setFocused(row.node.path);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    // 입력칸처럼 트리 안쪽 요소에서 누른 키는 다루지 않는다.
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    const current = nodeAt(focusedIndex);
    const actions = store.getState();
    switch (event.key) {
      case 'ArrowDown':
        focusFrom(focusedIndex + 1, 1);
        break;
      case 'ArrowUp':
        focusFrom(Math.max(focusedIndex - 1, 0), -1);
        break;
      case 'Home':
        focusFrom(0, 1);
        break;
      case 'End':
        focusFrom(rows.length - 1, -1);
        break;
      case 'ArrowRight':
        if (current?.node.isDirectory) {
          if (!current.expanded) actions.expand(current.node.path);
          // 빈 폴더면 다음 줄은 형제나 상위의 항목이다. 첫 자식이 있을 때만 옮긴다.
          else if (nodeAt(focusedIndex + 1)?.parentPath === current.node.path)
            focusFrom(focusedIndex + 1, 1);
        }
        break;
      case 'ArrowLeft':
        if (current?.node.isDirectory && current.expanded) actions.collapse(current.node.path);
        else if (current && current.parentPath !== '') actions.setFocused(current.parentPath);
        break;
      case 'Enter':
        if (current?.node.isDirectory) actions.toggle(current.node.path);
        else if (current) workspace.openFile(current.node.path);
        break;
      case 'F2':
        if (current && !readOnly) onRequestRename?.(current.node.path);
        break;
      case 'Delete':
        if (current && !readOnly) onRequestDelete?.(current.node.path);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const setRef = (element: HTMLDivElement | null) => {
    viewport.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };

  return (
    <div
      {...rest}
      ref={setRef}
      role="tree"
      aria-label={messages.treeLabel}
      aria-activedescendant={
        focusedRendered && focusedPath !== undefined ? rowId(baseId, focusedPath) : undefined
      }
      tabIndex={0}
      data-cf-viewport=""
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        // 행이 아닌 빈 곳이면 포커스를 풀어, 메뉴가 앞서 포커스한 항목이 아니라 최상위를 대상으로 하게 한다.
        if (!(event.target as Element).closest('[role="treeitem"]'))
          store.getState().setFocused(undefined);
        rest.onContextMenu?.(event);
      }}
      className={cn(
        'cf:relative cf:h-full cf:overflow-auto cf:outline-none cf:focus-visible:ring-2 cf:focus-visible:ring-ring cf:focus-visible:ring-inset',
        className,
      )}
    >
      <div className="cf:relative cf:w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const row = rows[item.index]!;
          if (row.type === 'create') {
            return (
              <div
                key={item.key}
                role="treeitem"
                aria-level={row.depth}
                aria-selected={false}
                // 줄마다 transform으로 따로 쌓인다. 이름 오류 안내가 다음 줄에 가리지 않게 입력 중인 줄을 위로 올린다.
                className="cf:absolute cf:inset-x-0 cf:top-0 cf:z-10 cf:flex cf:items-center cf:pr-2"
                style={{
                  height: TREE_ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                  paddingLeft: indentOf(row.depth) + 20,
                }}
              >
                {renderNameInput?.({
                  mode: 'create',
                  parentPath: row.parentPath,
                  isDirectory: row.isDirectory,
                  depth: row.depth,
                })}
              </div>
            );
          }
          return (
            <TreeRow
              key={item.key}
              id={rowId(baseId, row.node.path)}
              row={row}
              start={item.start}
              focused={item.index === focusedIndex}
              active={item.index === activeIndex}
              renaming={editing?.mode === 'rename' && editing.path === row.node.path}
              workspace={workspace}
              messages={messages}
              renderNameInput={renderNameInput}
            />
          );
        })}
      </div>
    </div>
  );
}
