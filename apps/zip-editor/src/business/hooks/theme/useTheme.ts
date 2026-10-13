// apps/zip-editor/src/business/hooks/theme/useTheme.ts
import { useEffect } from 'react';
import {
  applyThemeClass,
  subscribePrefersDark,
  writeThemePreference,
} from '@/services/browser/theme';
import type { ThemePreference } from '@/store/stores/appStore';
import { useAppContext, useAppState } from '../session/appContext';
import { resolveTheme } from './themeBusiness';

/**
 * 테마 선택.
 * - 2026-09 · carry-over: `.dark`를 스토어보다 먼저 바꾼다. `<CodeEditor>`는 theme prop이 바뀐 effect에서
 *   CSS 변수를 읽는데, 자식 effect가 부모보다 먼저 돌아 옛 변수를 읽을 수 있기 때문이다.
 */
export function useTheme() {
  const { store } = useAppContext();
  const preference = useAppState((state) => state.theme);
  const resolved = useAppState((state) => resolveTheme(state.theme, state.systemDark));
  useEffect(
    () =>
      subscribePrefersDark((dark) => {
        applyThemeClass(resolveTheme(store.getState().theme, dark));
        store.setState({ systemDark: dark });
      }),
    [store],
  );
  return {
    preference,
    resolved,
    setPreference: (next: ThemePreference) => {
      applyThemeClass(resolveTheme(next, store.getState().systemDark));
      writeThemePreference(next);
      store.setState({ theme: next });
    },
  };
}
