import { entryKey, nameOf, parentOf, placeEntry, ROOT } from './paths';
import { createTreeStore, type TreeStore } from './tree';
import type { FileSourceEntry } from './types';

/** 트리에 넣지 않았지만 다운로드 ZIP에는 원본 그대로 넣을 항목. */
export interface HiddenEntry {
  /** 내보낼 경로. 처음에는 원본 경로이고, 자기 폴더의 이름이 바뀌면 새 경로가 된다. */
  path: string;
  /** 원본 경로 그대로. */
  readonly originalPath: string;
  readonly isDirectory: boolean;
  readonly order: number;
  /** 빈 구간과 `.` 구간을 없앤 경로. 폴더 관계를 비교할 때 쓴다. */
  key: string;
  /**
   * 트리 폴더를 따라가는지. 트리 폴더 안의 무시 항목(`.DS_Store`, `._*`)과 경로가 겹쳐 숨긴 항목은
   * 그 폴더를 지우면 함께 빠지고 이름을 바꾸면 함께 옮긴다. `__MACOSX/`·`..`·빈 경로 항목은 따라가지 않는다.
   */
  readonly anchored: boolean;
}

export interface BuiltTree {
  readonly store: TreeStore;
  readonly hidden: HiddenEntry[];
  /** 새 항목에 줄 첫 순서 번호. */
  readonly nextOrder: number;
}

/** 원본 항목 목록으로 트리와 숨긴 항목 목록을 만든다. 파일을 읽지 않는다. */
export function buildTree(entries: readonly FileSourceEntry[]): BuiltTree {
  // 같은 원본 경로가 여러 번 나오면 마지막 항목만 쓴다. zip-archive도 같은 경로는 뒤 항목을 읽는다.
  const kindKey = (entry: FileSourceEntry) => `${entry.isDirectory ? 'd' : 'f'}:${entry.path}`;
  const lastIndex = new Map<string, number>();
  entries.forEach((entry, index) => lastIndex.set(kindKey(entry), index));

  const hidden: HiddenEntry[] = [];
  const files = new Map<string, { readonly entry: FileSourceEntry; readonly order: number }>();
  const dirs = new Map<string, number>();
  const addDirectory = (path: string, order: number) => {
    for (let p = path; p !== ROOT && !dirs.has(p); p = parentOf(p)) dirs.set(p, order);
  };

  entries.forEach((entry, index) => {
    if (lastIndex.get(kindKey(entry)) !== index) return;
    const placed = placeEntry(entry.path);
    if (placed.kind === 'hidden') {
      // 트리 폴더 안의 무시 항목(.DS_Store, ._*)만 폴더를 따라간다. __MACOSX는 첫 구간이 정확히 같을 때만이다.
      const key = entryKey(entry.path);
      const anchored = placed.reason === 'ignored' && key.split('/')[0] !== '__MACOSX';
      hidden.push(hiddenEntry(entry.path, entry.isDirectory, index, anchored));
      // 폴더 항목 없이 foo/.DS_Store만 있어도 ZIP에는 폴더 foo가 있다. 트리에 빈 폴더로 보인다.
      if (anchored) addDirectory(parentOf(key), index);
      return;
    }
    if (entry.isDirectory) {
      addDirectory(placed.path, index);
      return;
    }
    // 정리한 경로가 겹치면 뒤 항목이 트리에 들어가고, 앞 항목은 숨긴 채 원본 그대로 내보낸다.
    const previous = files.get(placed.path);
    if (previous) hidden.push(hiddenEntry(previous.entry.path, false, previous.order, true));
    files.set(placed.path, { entry, order: index });
    addDirectory(parentOf(placed.path), index);
  });

  // 파일과 폴더가 같은 경로면 폴더를 트리에 둔다(자식이 있으니까). 그 파일은 숨긴 채 원본 그대로 내보낸다.
  for (const [path, file] of files) {
    if (!dirs.has(path)) continue;
    hidden.push(hiddenEntry(file.entry.path, false, file.order, true));
    files.delete(path);
  }

  const store = createTreeStore();
  const byDepth = [...dirs.keys()].sort((a, b) => depth(a) - depth(b));
  for (const path of byDepth) {
    store.insert({
      node: { path, name: nameOf(path), isDirectory: true, size: 0 },
      origin: undefined,
      order: dirs.get(path)!,
    });
  }
  for (const [path, file] of files) {
    store.insert({
      node: { path, name: nameOf(path), isDirectory: false, size: file.entry.size },
      origin: file.entry.path,
      order: file.order,
    });
  }
  hidden.sort((a, b) => a.order - b.order);
  return { store, hidden, nextOrder: entries.length };
}

function hiddenEntry(
  path: string,
  isDirectory: boolean,
  order: number,
  anchored: boolean,
): HiddenEntry {
  return { path, originalPath: path, isDirectory, order, key: entryKey(path), anchored };
}

function depth(path: string): number {
  let count = 0;
  for (let i = 0; i < path.length; i += 1) if (path.charCodeAt(i) === 0x2f) count += 1;
  return count;
}
