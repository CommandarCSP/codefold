import { buildTree } from './build';
import {
  InvalidNameError,
  NotADirectoryError,
  NotAFileError,
  PathNotFoundError,
  ReplayError,
  VirtualFsError,
} from './errors';
import { planExport } from './export-plan';
import { checkName, nameKey } from './names';
import { joinPath, nameOf, parentOf, ROOT } from './paths';
import type { NodeRecord } from './tree';
import type {
  Disposable,
  ExportEntry,
  FileSource,
  NameProblem,
  TreeChange,
  TreeNode,
} from './types';

/** 이름 변경으로 옮긴 경로 하나. */

/** 구간마다 대소문자·NFC 차이를 없앤 경로. 숨긴 항목과 겹치는지 볼 때 쓴다. */
const pathKey = (path: string) => path.split('/').map(nameKey).join('/');
export interface RenamedPath {
  readonly from: string;
  readonly to: string;
  readonly isDirectory: boolean;
}

/** 트리 구조가 바뀔 때 받는 값. */
export interface TreeChangeEvent {
  readonly change: TreeChange;
  /** 이 변경을 적용한 뒤의 구조 버전. */
  readonly structureVersion: number;
}

/**
 * 파일 출처 위의 가상 파일 시스템. 트리 조회, 추가·삭제·이름 변경, 이름 검증, 구조 버전,
 * 변경 기록, 읽기, 내보내기 계획을 준다(ADR-0016). 팩토리로 만든 객체라 메서드를 콜백으로 넘겨도 된다(ADR-0017).
 */
export interface VirtualFs {
  /** 추가·삭제·이름 변경마다 1씩 오른다. 처음은 0이다(복원하면 적용한 변경 수). */
  structureVersion(): number;
  /** 지금까지의 트리 변경. 원본 목록에 순서대로 다시 적용하면 같은 트리가 나온다. */
  changes(): readonly TreeChange[];
  getNode(path: string): TreeNode | undefined;
  /** 정렬한 자식 목록. 폴더가 아니거나 없으면 빈 목록이다. 최상위는 `''`다. 구조가 바뀌기 전까지 같은 배열이다. */
  children(path: string): readonly TreeNode[];
  /** 원본 항목 경로. 새로 만든 파일과 폴더는 `undefined`다. */
  originalPathOf(path: string): string | undefined;
  /** `parentPath` 폴더에 `name`을 새로 만들 수 있는지. 쓸 수 있으면 `undefined`. */
  validateNewName(parentPath: string, name: string): NameProblem | undefined;
  /** `path`의 이름을 `newName`으로 바꿀 수 있는지. 자기 자신은 중복으로 보지 않는다. */
  validateRename(path: string, newName: string): NameProblem | undefined;
  /** 새 파일이나 폴더를 만든다. 이름은 NFC로 바꿔 쓴다. */
  add(parentPath: string, name: string, isDirectory: boolean): TreeNode;
  /** 파일이나 폴더를 지운다. 지운 노드 전체를 부모 먼저 순서로 돌려준다. */
  delete(path: string): readonly TreeNode[];
  /** 같은 폴더 안에서 이름을 바꾼다. 옮긴 경로 전체를 부모 먼저 돌려준다. 같은 이름이면 아무것도 하지 않고 `[]`다. */
  rename(path: string, newName: string): readonly RenamedPath[];
  /** 파일의 앞부분. 새로 만든 파일은 빈 바이트다. */
  readHead(path: string, bytes: number): Promise<Uint8Array>;
  /** 파일 전체. 새로 만든 파일은 빈 바이트다. */
  readAll(path: string): Promise<Uint8Array>;
  /**
   * 다운로드 ZIP에 넣을 항목 목록. `written`은 내용이 원본과 달라 새로 써야 하는 트리 경로다.
   * 새로 만든 파일은 `written`에 없어도 `write`다. 순수 데이터라 Worker로 그대로 보낼 수 있다.
   * @throws {PathNotFoundError} `written`에 트리에 없는 경로가 있다.
   * @throws {NotAFileError} `written`에 폴더가 있다.
   */
  exportEntries(written: ReadonlySet<string>): readonly ExportEntry[];
  /** 구조가 바뀔 때마다 부른다. */
  onDidChange(listener: (event: TreeChangeEvent) => void): Disposable;
}

/** `createVirtualFs`의 선택 값. */
export interface CreateVirtualFsOptions {
  /** 복원할 때 원본 목록에 순서대로 다시 적용할 트리 변경. */
  readonly changes?: readonly TreeChange[];
}

/** 파일 출처의 목록을 한 번 읽어 가상 파일 시스템을 만든다. 파일 내용은 읽지 않는다. */
export async function createVirtualFs(
  source: FileSource,
  options: CreateVirtualFsOptions = {},
): Promise<VirtualFs> {
  const built = buildTree(await source.list());
  const { store } = built;
  let hidden = built.hidden;
  let nextOrder = built.nextOrder;
  let version = 0;
  const changeLog: TreeChange[] = [];
  const listeners = new Set<(event: TreeChangeEvent) => void>();

  const existing = (path: string): NodeRecord => {
    const record = path === ROOT ? undefined : store.get(path);
    if (!record) throw new PathNotFoundError(path);
    return record;
  };

  const fileRecord = (path: string): NodeRecord => {
    const record = existing(path);
    if (record.node.isDirectory) throw new NotAFileError(path);
    return record;
  };

  const directory = (path: string): NodeRecord => {
    const record = store.get(path);
    if (!record) throw new PathNotFoundError(path);
    if (!record.node.isDirectory) throw new NotADirectoryError(path);
    return record;
  };

  // 같은 폴더에 대소문자·NFC만 다른 이름이 있으면 중복이다. `except`는 이름을 바꾸는 자기 자신이다.
  const isDuplicate = (parentPath: string, name: string, except?: string) => {
    const key = nameKey(name);
    for (const sibling of store.childPaths(parentPath)) {
      if (sibling !== except && nameKey(nameOf(sibling)) === key) return true;
    }
    // 트리에 없지만 받은 ZIP에 들어갈 숨긴 항목(__MACOSX 안의 항목 포함)과도 겹치면 안 된다. 같은 경로가
    // 두 번 들어가거나, 새 파일과 숨긴 항목의 폴더가 같은 경로가 된다. 이름을 바꾸는 폴더 안의 숨긴 항목은 뺀다.
    const target = pathKey(joinPath(parentPath, name));
    return hidden.some((entry) => {
      if (except !== undefined && entry.anchored && isAtOrUnder(entry.key, except)) return false;
      const hiddenKey = pathKey(entry.key);
      return hiddenKey === target || hiddenKey.startsWith(`${target}/`);
    });
  };

  const problemFor = (parentPath: string, name: string, except?: string): NameProblem | undefined =>
    checkName(name) ?? (isDuplicate(parentPath, name, except) ? 'duplicate' : undefined);

  const commit = (change: TreeChange) => {
    version += 1;
    changeLog.push(change);
    const event: TreeChangeEvent = { change, structureVersion: version };
    // 한 구독자가 던져도 변경은 이미 끝났고 다른 구독자도 받아야 한다. 오류는 따로 던져 드러낸다.
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  };

  const add = (parentPath: string, rawName: string, isDirectory: boolean): TreeNode => {
    directory(parentPath);
    const name = rawName.normalize('NFC');
    const problem = problemFor(parentPath, name);
    if (problem) throw new InvalidNameError(name, problem);
    const path = joinPath(parentPath, name);
    const node: TreeNode = { path, name, isDirectory, size: 0 };
    store.insert({ node, origin: undefined, order: nextOrder });
    nextOrder += 1;
    commit({ type: 'add', path, isDirectory });
    return node;
  };

  const remove = (path: string): readonly TreeNode[] => {
    existing(path);
    const removed = store.removeSubtree(path).map((record) => record.node);
    // 그 경로와 아래의 숨긴 항목(무시 항목, 겹쳐 숨긴 항목)도 함께 뺀다.
    hidden = hidden.filter((entry) => !(entry.anchored && isAtOrUnder(entry.key, path)));
    commit({ type: 'delete', path });
    return removed;
  };

  const rename = (path: string, rawName: string): readonly RenamedPath[] => {
    const record = existing(path);
    const name = rawName.normalize('NFC');
    if (name === record.node.name) return [];
    const parentPath = parentOf(path);
    const problem = problemFor(parentPath, name, path);
    if (problem) throw new InvalidNameError(name, problem);
    const to = joinPath(parentPath, name);
    const moved = store.moveSubtree(path, to).map(({ from, to: next }) => ({
      from: from.node.path,
      to: next.node.path,
      isDirectory: next.node.isDirectory,
    }));
    // 폴더 안의 숨긴 항목도 새 경로로 옮긴다.
    for (const entry of hidden) {
      if (entry.anchored && entry.key.startsWith(`${path}/`)) {
        entry.key = to + entry.key.slice(path.length);
        entry.path = entry.key;
      }
    }
    commit({ type: 'rename', from: path, to });
    return moved;
  };

  const apply = (change: TreeChange) => {
    switch (change.type) {
      case 'add':
        add(parentOf(change.path), nameOf(change.path), change.isDirectory);
        return;
      case 'delete':
        remove(change.path);
        return;
      case 'rename':
        // 옮기기는 없다. 저장된 이름 변경도 같은 폴더 안이어야 한다.
        if (parentOf(change.from) !== parentOf(change.to)) {
          throw new VirtualFsError(
            `이름 변경은 같은 폴더 안에서만 할 수 있습니다: ${change.from} → ${change.to}`,
          );
        }
        rename(change.from, nameOf(change.to));
        return;
    }
  };

  (options.changes ?? []).forEach((change, index) => {
    try {
      apply(change);
    } catch (error) {
      throw new ReplayError(index, change, error);
    }
  });

  return {
    structureVersion: () => version,
    changes: () => changeLog.slice(),
    getNode: (path) => store.get(path)?.node,
    children: (path) => store.sortedChildren(path),
    originalPathOf: (path) => store.get(path)?.origin,
    validateNewName: (parentPath, name) => problemFor(parentPath, name.normalize('NFC')),
    validateRename: (path, newName) => {
      const name = newName.normalize('NFC');
      if (name === store.get(path)?.node.name) return undefined;
      return problemFor(parentOf(path), name, path);
    },
    add,
    delete: remove,
    rename,
    readHead: async (path, bytes) => {
      const { origin } = fileRecord(path);
      return origin === undefined ? new Uint8Array() : source.readHead(origin, bytes);
    },
    readAll: async (path) => {
      const { origin } = fileRecord(path);
      return origin === undefined ? new Uint8Array() : source.readAll(origin);
    },
    exportEntries: (written) => planExport(store, hidden, written),
    onDidChange: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
}

function isAtOrUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}
