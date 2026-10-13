// apps/zip-editor/src/test/media.ts
/** matchMedia 흉내. `set`으로 맞는 쿼리를 바꾸면 change를 보낸다. */
export function installMatchMedia(initial: Readonly<Record<string, boolean>> = {}) {
  const matches = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return matches.get(query) ?? false;
      },
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: () => void) => {
        const set = listeners.get(query) ?? new Set();
        set.add(listener);
        listeners.set(query, set);
      },
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.get(query)?.delete(listener),
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return {
    set(query: string, value: boolean) {
      matches.set(query, value);
      for (const listener of [...(listeners.get(query) ?? [])]) listener();
    },
  };
}
