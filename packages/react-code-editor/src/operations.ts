import { decodeText } from '@codefold/file-type-detector';
import type { ModelRegistry, UnexportedTracker } from '@codefold/monaco-binding';
import type { TreeChange, TreeNode, VirtualFs } from '@codefold/virtual-fs';
import { FileChangedError } from './errors';
import { NEW_FILE_INFO, NEW_FILE_KIND, readOriginal, toLoaded } from './files';
import { isAtOrUnder } from './paths';
import type { EditorStore } from './store';
import type { EditorAreaPort, LoadedFile } from './types';

/** 트리 조작이 쓰는 작업 공간 내부. */
export interface OperationContext {
  readonly fs: VirtualFs;
  readonly registry: ModelRegistry;
  readonly tracker: UnexportedTracker;
  readonly store: EditorStore;
  area(): EditorAreaPort | undefined;
  /** 연 파일 정보를 둔다. */
  setLoaded(path: string, file: LoadedFile): void;
  /** 연 파일 정보를 새 경로로 옮긴다. 없으면 아무것도 하지 않는다. */
  moveLoaded(from: string, to: string): void;
  forgetLoaded(path: string): void;
  /** model 입력 구독을 건다. */
  watchContent(path: string): void;
  /** 입력이 아닌 방법(되돌리기 등)으로 내용이 바뀌었다. 자동 저장이 이 신호를 듣는다. */
  contentChanged(path: string): void;
  /** 그 경로의 진행 중인 읽기를 무효로 만든다(이름 변경·삭제). */
  invalidate(path: string): void;
  generationOf(path: string): number;
  isCurrent(path: string, generation: number): boolean;
  /** 조작이 끝났다. 트리 변경을 알린다. */
  treeChanged(change: TreeChange): void;
}

export interface WorkspaceOperations {
  /** 새 파일이나 폴더를 만든다. 새 파일은 빈 UTF-8 model로 연다. 탭은 쓰는 쪽이 연다. */
  createEntry(parentPath: string, name: string, isDirectory: boolean): TreeNode;
  /** 지운다. 안의 파일 탭을 모든 그룹에서 닫고 model을 지운다. 확인창은 쓰는 쪽이 띄운다. */
  deleteEntry(path: string): void;
  /** 이름을 바꾼다. model·수정 여부·탭을 새 경로로 옮긴다. */
  renameEntry(path: string, newName: string): void;
  /** 원본 내용으로 되돌린다. 확인창은 쓰는 쪽이 띄운다. */
  revertFile(path: string): Promise<void>;
  /** 그 항목(폴더면 그 안)에 고친 파일이 있는지. */
  needsDeleteConfirm(path: string): boolean;
}

/**
 * 트리 조작. 이름 변경·삭제는 등록부를 파일마다 먼저 부르고, 그다음 추적기에 트리 변경을 한 번 알린다
 * (monaco-binding의 호출 순서).
 */
export function createOperations(context: OperationContext): WorkspaceOperations {
  const { fs, registry, tracker, store } = context;
  return {
    createEntry: (parentPath, name, isDirectory) => {
      const node = fs.add(parentPath, name, isDirectory);
      tracker.recordTreeChange({ type: 'add', path: node.path }, fs.structureVersion());
      if (!isDirectory) {
        registry.open(node.path, '');
        context.setLoaded(node.path, {
          kind: 'text',
          path: node.path,
          info: NEW_FILE_INFO,
          detected: NEW_FILE_KIND,
        });
        context.watchContent(node.path);
      }
      store.getState().expand(parentPath);
      context.treeChanged({ type: 'add', path: node.path, isDirectory });
      return node;
    },
    deleteEntry: (path) => {
      const removed = fs.delete(path);
      for (const node of removed) {
        if (node.isDirectory) continue;
        context.invalidate(node.path);
        context.area()?.close(node.path);
        registry.remove(node.path);
        context.forgetLoaded(node.path);
      }
      tracker.recordTreeChange({ type: 'delete', path }, fs.structureVersion());
      store.getState().applyDelete(path);
      context.treeChanged({ type: 'delete', path });
    },
    renameEntry: (path, newName) => {
      const moved = fs.rename(path, newName);
      const root = moved[0];
      if (!root) return;
      for (const entry of moved) {
        if (entry.isDirectory) continue;
        context.invalidate(entry.from);
        context.invalidate(entry.to);
        registry.rename(entry.from, entry.to);
        context.moveLoaded(entry.from, entry.to);
        context.area()?.rename(entry.from, entry.to);
      }
      tracker.recordTreeChange({ type: 'rename', from: path, to: root.to }, fs.structureVersion());
      store.getState().applyRename(moved);
      context.treeChanged({ type: 'rename', from: path, to: root.to });
    },
    revertFile: async (path) => {
      const generation = context.generationOf(path);
      const original = await readOriginal(fs, path).catch((error: unknown) => {
        if (!context.isCurrent(path, generation)) throw new FileChangedError(path);
        throw error;
      });
      // 읽는 동안 이름이 바뀌었거나 지워졌으면 되돌리지 않는다. 쓰는 쪽이 새 경로로 다시 고르게 한다.
      if (!context.isCurrent(path, generation)) throw new FileChangedError(path);
      if (original.kind === 'text') {
        registry.revert(path, original.text);
        context.setLoaded(path, toLoaded(path, original));
      } else if (original.kind === 'image' && original.info) {
        // 코드로 연 SVG. 원본 바이트를 그 인코딩으로 읽어 되돌린다.
        registry.revert(path, decodeText(original.bytes, original.info.encoding));
      } else {
        return;
      }
      context.watchContent(path);
      context.contentChanged(path);
    },
    needsDeleteConfirm: (path) => registry.dirtyPaths().some((dirty) => isAtOrUnder(dirty, path)),
  };
}
