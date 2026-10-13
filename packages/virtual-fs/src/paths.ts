/** 최상위 폴더의 경로. */
export const ROOT = '';

/** 원본 항목이 트리에 들어가는지, 들어가지 않으면 왜인지. */
export type EntryPlacement =
  | { readonly kind: 'tree'; readonly path: string }
  | { readonly kind: 'hidden'; readonly reason: 'empty' | 'unsafe' | 'ignored' };

/** 빈 구간과 `.` 구간만 없앤 경로. 숨긴 항목끼리 폴더 관계를 비교할 때 쓴다. */
export function entryKey(raw: string): string {
  return raw
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/**
 * 원본 경로를 트리 경로로 정리한다. 앞 `/`, 빈 구간, `.` 구간을 없앤다.
 * `..`이 들거나 비는 경로, 무시 목록에 걸린 경로는 트리에 넣지 않는다.
 */
export function placeEntry(raw: string): EntryPlacement {
  const segments = entryKey(raw).split('/');
  if (segments.length === 1 && segments[0] === '') return { kind: 'hidden', reason: 'empty' };
  if (segments.includes('..')) return { kind: 'hidden', reason: 'unsafe' };
  if (isIgnored(segments)) return { kind: 'hidden', reason: 'ignored' };
  return { kind: 'tree', path: segments.join('/') };
}

// 무시 목록은 이 함수 한 곳에만 둔다: macOS가 넣는 __MACOSX 폴더, .DS_Store, AppleDouble(._*) 파일.
function isIgnored(segments: readonly string[]): boolean {
  if (segments[0] === '__MACOSX') return true;
  const name = segments[segments.length - 1] ?? '';
  return name === '.DS_Store' || name.startsWith('._');
}

export function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? ROOT : path.slice(0, at);
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function joinPath(parent: string, name: string): string {
  return parent === ROOT ? name : `${parent}/${name}`;
}
