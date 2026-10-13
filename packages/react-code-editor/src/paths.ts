/** 부모 폴더 경로. 최상위 항목의 부모는 `''`다. */
export function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

/** `path`가 `folder` 자신이거나 그 아래인지. */
export function isAtOrUnder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** 최상위를 뺀 부모 폴더 경로들(가까운 것부터). */
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  for (let p = parentOf(path); p !== ''; p = parentOf(p)) out.push(p);
  return out;
}

/** 경로의 마지막 이름. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
