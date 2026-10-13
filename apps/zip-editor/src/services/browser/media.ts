// apps/zip-editor/src/services/browser/media.ts
/** 폭 1024px 미만이면 트리를 접는 패널로 바꾼다. */
export const NARROW_QUERY = '(max-width: 1023.98px)';

export function matchesMedia(query: string): boolean {
  return window.matchMedia(query).matches;
}

export function subscribeMedia(query: string, onChange: () => void): () => void {
  const list = window.matchMedia(query);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}
