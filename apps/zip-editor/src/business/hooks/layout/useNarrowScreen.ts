// apps/zip-editor/src/business/hooks/layout/useNarrowScreen.ts
import { useSyncExternalStore } from 'react';
import { matchesMedia, NARROW_QUERY, subscribeMedia } from '@/services/browser/media';

/** 폭이 1024px보다 좁은가. 폭이 바뀌면 다시 그린다. */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeMedia(NARROW_QUERY, onChange),
    () => matchesMedia(NARROW_QUERY),
  );
}
