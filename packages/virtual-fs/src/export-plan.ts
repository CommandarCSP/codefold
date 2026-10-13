import type { HiddenEntry } from './build';
import { NotAFileError, PathNotFoundError } from './errors';
import { parentOf, ROOT } from './paths';
import type { TreeStore } from './tree';
import type { ExportEntry } from './types';

/**
 * 다운로드 ZIP에 넣을 항목 목록을 만든다. 원본 목록 순서를 따르고, 새 항목은 만든 순서로 그 뒤에 둔다.
 *
 * - 원본에서 온 파일: `written`에 있으면 원래 경로를 가진 `write`, 없으면 `copy`(ADR-0032)
 * - 새로 만든 파일: 늘 `write`
 * - 숨긴 항목(무시 목록, `..`, 겹친 경로, 파일·폴더 충돌): 원본 경로 그대로 `copy`
 * - 폴더: 계획의 다른 항목이 그 아래에 없을 때만 `directory`(ADR-0033)
 */
export function planExport(
  store: TreeStore,
  hidden: readonly HiddenEntry[],
  written: ReadonlySet<string>,
): ExportEntry[] {
  for (const path of written) {
    const record = path === ROOT ? undefined : store.get(path);
    if (!record) throw new PathNotFoundError(path);
    if (record.node.isDirectory) throw new NotAFileError(path);
  }

  const items: Array<{ readonly order: number; readonly entry: ExportEntry }> = [];
  const fileKeys: string[] = [];
  const directories: Array<{
    readonly key: string;
    readonly order: number;
    readonly path: string;
  }> = [];

  for (const record of store.records()) {
    const { path, isDirectory } = record.node;
    if (path === ROOT) continue;
    if (isDirectory) {
      directories.push({ key: path, order: record.order, path });
      continue;
    }
    fileKeys.push(path);
    const entry: ExportEntry =
      record.origin === undefined
        ? { type: 'write', path }
        : written.has(path)
          ? { type: 'write', path, originalPath: record.origin }
          : { type: 'copy', path, originalPath: record.origin };
    items.push({ order: record.order, entry });
  }

  for (const entry of hidden) {
    const { key } = entry;
    if (entry.isDirectory) {
      // 원본 폴더 경로 끝의 /는 떼고 낸다. 쓰는 쪽이 한 번만 붙인다.
      if (key !== ROOT)
        directories.push({ key, order: entry.order, path: entry.path.replace(/\/+$/, '') });
      continue;
    }
    fileKeys.push(key);
    items.push({
      order: entry.order,
      entry: { type: 'copy', path: entry.path, originalPath: entry.originalPath },
    });
  }

  // 어떤 파일이나 다른 폴더 항목의 조상인 폴더는 그 항목의 경로가 싣고 가므로 따로 넣지 않는다.
  const covered = new Set<string>();
  const cover = (key: string) => {
    for (let p = parentOf(key); p !== ROOT && !covered.has(p); p = parentOf(p)) covered.add(p);
  };
  for (const key of fileKeys) cover(key);
  for (const directory of directories) cover(directory.key);

  const emitted = new Set<string>();
  for (const directory of directories) {
    if (covered.has(directory.key) || emitted.has(directory.key)) continue;
    emitted.add(directory.key);
    items.push({ order: directory.order, entry: { type: 'directory', path: directory.path } });
  }

  items.sort((a, b) => a.order - b.order);
  return items.map((item) => item.entry);
}
