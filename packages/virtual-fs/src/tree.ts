import { compareNodes } from './names';
import { nameOf, parentOf, ROOT } from './paths';
import type { TreeNode } from './types';

/** 트리 노드와 내부 정보. 밖으로는 `node`만 보인다. */
export interface NodeRecord {
  readonly node: TreeNode;
  /** 원본 항목 경로. 새로 만든 항목과 경로에서 생긴 폴더는 없다. */
  readonly origin: string | undefined;
  /** 내보내기 순서. 원본 항목은 목록 순서, 새 항목은 그 뒤다. */
  readonly order: number;
}

/** 경로 → 노드, 폴더 → 자식 경로를 들고, 정렬한 자식 목록을 폴더마다 캐시한다. */
export interface TreeStore {
  get(path: string): NodeRecord | undefined;
  childPaths(dir: string): ReadonlySet<string>;
  /** 정렬한 자식 목록. 그 폴더의 구조가 바뀌기 전까지 같은 배열을 돌려준다. */
  sortedChildren(dir: string): readonly TreeNode[];
  /** 부모 폴더가 이미 있어야 한다. */
  insert(record: NodeRecord): void;
  /** 그 경로와 아래 항목을 모두 지우고, 지운 기록을 부모 먼저 순서로 돌려준다. */
  removeSubtree(path: string): NodeRecord[];
  /** 같은 폴더 안에서 경로를 바꾼다. 아래 항목도 모두 옮긴다. */
  moveSubtree(from: string, to: string): Array<{ from: NodeRecord; to: NodeRecord }>;
  records(): IterableIterator<NodeRecord>;
}

const EMPTY: ReadonlySet<string> = new Set();
// 없는 폴더나 파일의 자식 목록. 늘 같은 배열이라 React 구독(useSyncExternalStore)이 매번 바뀐 값으로 보지 않는다.
const NO_CHILDREN: readonly TreeNode[] = Object.freeze([]);

export function createTreeStore(): TreeStore {
  const nodes = new Map<string, NodeRecord>();
  const children = new Map<string, Set<string>>();
  const sorted = new Map<string, readonly TreeNode[]>();
  nodes.set(ROOT, {
    node: { path: ROOT, name: '', isDirectory: true, size: 0 },
    origin: undefined,
    order: -1,
  });
  children.set(ROOT, new Set());

  const insert = (record: NodeRecord) => {
    const { path, isDirectory } = record.node;
    const parent = parentOf(path);
    const siblings = children.get(parent);
    if (!siblings) throw new Error(`부모 폴더가 없습니다: ${path}`);
    nodes.set(path, record);
    if (isDirectory && !children.has(path)) children.set(path, new Set());
    siblings.add(path);
    sorted.delete(parent);
  };

  // 부모 먼저(너비 우선) 순서의 아래 경로 목록.
  const subtree = (path: string): string[] => {
    const out = [path];
    for (let i = 0; i < out.length; i += 1) {
      for (const child of children.get(out[i]!) ?? EMPTY) out.push(child);
    }
    return out;
  };

  const detach = (paths: readonly string[]) => {
    for (const p of paths) {
      nodes.delete(p);
      children.delete(p);
      sorted.delete(p);
    }
    const parent = parentOf(paths[0]!);
    children.get(parent)?.delete(paths[0]!);
    sorted.delete(parent);
  };

  return {
    get: (path) => nodes.get(path),
    childPaths: (dir) => children.get(dir) ?? EMPTY,
    sortedChildren: (dir) => {
      const cached = sorted.get(dir);
      if (cached) return cached;
      const kids = children.get(dir);
      if (!kids) return NO_CHILDREN;
      const list = Object.freeze([...kids].map((p) => nodes.get(p)!.node).sort(compareNodes));
      sorted.set(dir, list);
      return list;
    },
    insert,
    removeSubtree: (path) => {
      const paths = subtree(path);
      const removed = paths.map((p) => nodes.get(p)!);
      detach(paths);
      return removed;
    },
    moveSubtree: (from, to) => {
      const paths = subtree(from);
      const records = paths.map((p) => nodes.get(p)!);
      detach(paths);
      return records.map((old) => {
        const path = to + old.node.path.slice(from.length);
        const record: NodeRecord = { ...old, node: { ...old.node, path, name: nameOf(path) } };
        insert(record);
        return { from: old, to: record };
      });
    },
    records: () => nodes.values(),
  };
}
