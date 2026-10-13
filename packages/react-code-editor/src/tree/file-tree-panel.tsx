import { FilePlus, FolderPlus } from 'lucide-react';
import { ContextMenu } from 'radix-ui';
import { useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { cn } from '../cn';
import { FileChangedError } from '../errors';
import { formatMessage, resolveMessages, type CodeEditorMessages } from '../messages';
import { nameOf, parentOf } from '../paths';
import { IconButton } from '../ui';
import type { EditorWorkspace } from '../workspace';
import { useConfirm } from './use-confirm';
import { FileTree } from './file-tree';
import type { NameInputRow } from './flatten';
import { NameInput } from './name-input';

export interface FileTreePanelProps {
  readonly workspace: EditorWorkspace;
  /** 바꿀 문구만 넘긴다. 나머지는 한국어 기본값이다. */
  readonly messages?: Partial<CodeEditorMessages>;
  readonly className?: string;
}

/**
 * 도구 모음, 오른쪽 클릭 메뉴, 이름 입력칸, 확인창을 갖춘 파일 트리.
 * 끌어서 옮기기는 없다.
 */
export function FileTreePanel({ workspace, messages: overrides, className }: FileTreePanelProps) {
  const messages = resolveMessages(overrides);
  return <TreePanelBody workspace={workspace} messages={messages} className={className} />;
}

interface TreePanelBodyProps {
  readonly workspace: EditorWorkspace;
  readonly messages: CodeEditorMessages;
  readonly className: string | undefined;
}

function TreePanelBody({ workspace, messages, className }: TreePanelBodyProps) {
  const { store, fs } = workspace;
  const readOnly = useStore(store, (state) => state.readOnly);
  const focusedPath = useStore(store, (state) => state.focusedPath);
  const focusedDirty = useStore(
    store,
    (state) => state.focusedPath !== undefined && state.dirty[state.focusedPath] === true,
  );
  const tree = useRef<HTMLDivElement>(null);
  const focusTree = () => tree.current?.focus();

  // 포커스된 행이 폴더면 그 안, 파일이면 그 부모, 없으면 최상위에 만든다.
  const startCreate = (isDirectory: boolean) => {
    const focused = store.getState().focusedPath;
    const node = focused === undefined ? undefined : fs.getNode(focused);
    const parent = node === undefined ? '' : node.isDirectory ? node.path : parentOf(node.path);
    store.getState().startCreate(parent, isDirectory);
  };

  const [confirm, confirmDialog] = useConfirm();

  const requestDelete = async (path: string) => {
    if (workspace.needsDeleteConfirm(path)) {
      const confirmed = await confirm({
        title: messages.deleteConfirmTitle,
        description: formatMessage(messages.deleteConfirmDescription, { name: nameOf(path) }),
        confirmLabel: messages.deleteConfirmAction,
        cancelLabel: messages.cancel,
        destructive: true,
      });
      // 확인창이 떠 있는 사이 편집 잠금을 잃었으면 지우지 않는다(ADR-0024).
      if (!confirmed || store.getState().readOnly) {
        focusTree();
        return;
      }
    }
    workspace.deleteEntry(path);
    focusTree();
  };

  const requestRevert = async (path: string) => {
    const confirmed = await confirm({
      title: messages.revertConfirmTitle,
      description: formatMessage(messages.revertConfirmDescription, { name: nameOf(path) }),
      confirmLabel: messages.revertConfirmAction,
      cancelLabel: messages.cancel,
      destructive: true,
    });
    if (confirmed && !store.getState().readOnly) {
      // 확인창을 띄운 사이에 파일이 바뀌었으면 되돌리지 않는다.
      await workspace.revertFile(path).catch((error: unknown) => {
        if (!(error instanceof FileChangedError)) throw error;
      });
    }
    focusTree();
  };

  const renderNameInput = (row: NameInputRow): ReactNode => (
    <NameInput workspace={workspace} messages={messages} row={row} onDone={focusTree} />
  );

  const menuItem =
    'cf:relative cf:flex cf:cursor-default cf:items-center cf:rounded-sm cf:px-2 cf:py-1.5 cf:text-sm cf:outline-none cf:select-none cf:data-highlighted:bg-accent cf:data-highlighted:text-accent-foreground cf:data-disabled:pointer-events-none cf:data-disabled:opacity-50';

  return (
    <div
      className={cn(
        'cf:flex cf:h-full cf:min-h-0 cf:flex-col cf:bg-background cf:text-foreground',
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label={messages.treeToolbarLabel}
        className="cf:flex cf:shrink-0 cf:items-center cf:justify-end cf:gap-0.5 cf:border-b cf:border-border cf:px-1 cf:py-0.5"
      >
        <IconButton label={messages.newFile} disabled={readOnly} onClick={() => startCreate(false)}>
          <FilePlus aria-hidden className="cf:size-4" />
        </IconButton>
        <IconButton
          label={messages.newFolder}
          disabled={readOnly}
          onClick={() => startCreate(true)}
        >
          <FolderPlus aria-hidden className="cf:size-4" />
        </IconButton>
      </div>
      <ContextMenu.Root modal={false}>
        <ContextMenu.Trigger asChild disabled={readOnly}>
          <FileTree
            ref={tree}
            workspace={workspace}
            messages={messages}
            className="cf:min-h-0 cf:flex-1"
            onRequestRename={(path) => store.getState().startRename(path)}
            onRequestDelete={(path) => void requestDelete(path)}
            renderNameInput={renderNameInput}
          />
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="cf:z-50 cf:min-w-40 cf:rounded-md cf:border cf:border-border cf:bg-popover cf:p-1 cf:text-popover-foreground cf:shadow-md"
            // 메뉴에서 이름 바꾸기나 새 항목을 고르면 입력칸이 포커스를 가져야 한다. 닫히며 트리로 포커스를 돌리지 않는다.
            onCloseAutoFocus={(event) => {
              if (store.getState().editing) event.preventDefault();
            }}
          >
            <ContextMenu.Item className={menuItem} onSelect={() => startCreate(false)}>
              {messages.newFile}
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItem} onSelect={() => startCreate(true)}>
              {messages.newFolder}
            </ContextMenu.Item>
            <ContextMenu.Separator className="cf:my-1 cf:h-px cf:bg-border" />
            <ContextMenu.Item
              className={menuItem}
              disabled={focusedPath === undefined}
              onSelect={() => {
                if (focusedPath !== undefined) store.getState().startRename(focusedPath);
              }}
            >
              {messages.rename}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menuItem}
              disabled={focusedPath === undefined}
              onSelect={() => {
                if (focusedPath !== undefined) void requestDelete(focusedPath);
              }}
            >
              {messages.delete}
            </ContextMenu.Item>
            <ContextMenu.Item
              className={menuItem}
              disabled={!focusedDirty}
              onSelect={() => {
                if (focusedPath !== undefined) void requestRevert(focusedPath);
              }}
            >
              {messages.revert}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {confirmDialog}
    </div>
  );
}
