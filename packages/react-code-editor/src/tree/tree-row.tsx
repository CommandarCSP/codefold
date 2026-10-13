import { guessKindByExtension, type KindCategory } from '@codefold/file-type-detector';
import {
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { cn } from '../cn';
import type { CodeEditorMessages } from '../messages';
import type { EditorWorkspace } from '../workspace';
import type { NameInputRow, TreeRowData } from './flatten';
import { indentOf, TREE_ROW_HEIGHT } from './layout';

/** 파일 아이콘. 압축을 풀지 않고 확장자로만 짐작한다(ADR-0010). 실제 종류는 열 때 정한다. */
const FILE_ICONS: Readonly<Record<KindCategory, LucideIcon>> = {
  text: FileText,
  image: FileImage,
  binary: FileArchive,
};
export interface TreeRowProps {
  readonly id: string;
  readonly row: Extract<TreeRowData, { type: 'node' }>;
  /** 가상화 목록 안의 위치(px). */
  readonly start: number;
  readonly focused: boolean;
  readonly active: boolean;
  readonly renaming: boolean;
  readonly workspace: EditorWorkspace;
  readonly messages: CodeEditorMessages;
  readonly renderNameInput: ((row: NameInputRow) => ReactNode) | undefined;
}

// 부모 TreeViewport는 가상화 라이브러리 때문에 React Compiler를 끄고 스크롤마다 다시 그린다.
// 그때마다 모든 행이 다시 그려지지 않도록 memo로 감싼다(ADR-0019의 예외). 행은 자기 경로의 수정 여부만 구독한다.
export const TreeRow = memo(function TreeRow({
  id,
  row,
  start,
  focused,
  active,
  renaming,
  workspace,
  messages,
  renderNameInput,
}: TreeRowProps) {
  const { node, depth } = row;
  const { store } = workspace;
  const modified = useStore(store, (state) =>
    node.isDirectory ? (state.dirtyFolders[node.path] ?? 0) > 0 : state.dirty[node.path] === true,
  );
  const onClick = () => {
    const actions = store.getState();
    actions.setFocused(node.path);
    if (node.isDirectory) actions.toggle(node.path);
    else workspace.openFile(node.path);
  };
  const Chevron = row.expanded ? ChevronDown : ChevronRight;
  const Icon = node.isDirectory
    ? row.expanded
      ? FolderOpen
      : Folder
    : FILE_ICONS[guessKindByExtension(node.name)];
  return (
    // 키보드는 트리 컨테이너가 aria-activedescendant로 다룬다. 행은 포커스를 받지 않는다(ADR-0029).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      id={id}
      role="treeitem"
      aria-level={depth}
      aria-setsize={row.setSize}
      aria-posinset={row.posInSet}
      aria-expanded={node.isDirectory ? row.expanded : undefined}
      aria-selected={active}
      data-path={node.path}
      data-focused={focused ? '' : undefined}
      onClick={onClick}
      onContextMenu={() => store.getState().setFocused(node.path)}
      className={cn(
        'cf:absolute cf:inset-x-0 cf:top-0 cf:flex cf:items-center cf:gap-1 cf:pr-2 cf:text-sm cf:text-foreground cf:select-none cf:hover:bg-muted',
        active && 'cf:bg-selected cf:text-accent-foreground cf:hover:bg-selected',
        focused && 'cf:outline cf:outline-1 cf:-outline-offset-1 cf:outline-ring',
        // 이름을 바꾸는 동안에는 오류 안내가 다음 줄에 가리지 않게 위로 올린다(file-tree의 새 항목 줄과 같다).
        renaming && 'cf:z-10',
      )}
      style={{
        height: TREE_ROW_HEIGHT,
        transform: `translateY(${start}px)`,
        paddingLeft: indentOf(depth),
      }}
    >
      {node.isDirectory ? (
        <Chevron aria-hidden className="cf:size-4 cf:shrink-0" />
      ) : (
        <span aria-hidden className="cf:size-4 cf:shrink-0" />
      )}
      <Icon aria-hidden className="cf:size-4 cf:shrink-0 cf:text-muted-foreground" />
      {renaming && renderNameInput ? (
        renderNameInput({ mode: 'rename', path: node.path, name: node.name, depth })
      ) : (
        <span className="cf:truncate">{node.name}</span>
      )}
      {modified && (
        <>
          <span
            aria-hidden
            className="cf:ml-auto cf:size-2 cf:shrink-0 cf:rounded-full cf:bg-modified"
          />
          <span className="cf:sr-only">
            {node.isDirectory ? messages.folderModified : messages.modified}
          </span>
        </>
      )}
    </div>
  );
});
