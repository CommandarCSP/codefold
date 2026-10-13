// apps/zip-editor/src/business/hooks/autosave/autosaveBusiness.ts
import type { TreeChange } from '@codefold/virtual-fs';

const isUnder = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/**
 * 트리 변경 때 저장본을 다시 써야 하는 경로.
 * - 2026-09: 삭제는 그 아래 저장본을 지우고, 이름 변경은 옛 경로 저장본을 지운 뒤 새 경로의 고친 내용을 넣는다.
 *   바로 저장해야 브라우저를 곧바로 닫아도 새 경로로 되살아난다.
 */
export function affectedPaths(
  change: TreeChange,
  saved: ReadonlySet<string>,
  dirty: readonly string[],
): string[] {
  const out = new Set<string>();
  const fromSaved = (root: string) => {
    for (const path of saved) if (isUnder(path, root)) out.add(path);
  };
  const fromDirty = (root: string) => {
    for (const path of dirty) if (isUnder(path, root)) out.add(path);
  };
  if (change.type === 'delete') fromSaved(change.path);
  if (change.type === 'rename') {
    fromSaved(change.from);
    fromDirty(change.to);
  }
  if (change.type === 'add') fromDirty(change.path);
  return [...out];
}

/** 읽은 내용에 있는 경로는 넣고, 없는 경로(원본과 같아졌거나 지워짐)는 저장본에서 지운다. */
export function splitContents(
  paths: readonly string[],
  contents: Readonly<Record<string, string>>,
): { put: Record<string, string>; remove: string[] } {
  const put: Record<string, string> = {};
  const remove: string[] = [];
  for (const path of paths) {
    const text = contents[path];
    if (text === undefined) remove.push(path);
    else put[path] = text;
  }
  return { put, remove };
}
