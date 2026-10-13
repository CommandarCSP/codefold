// apps/zip-editor/src/services/browser/theme.ts
import type { ThemeMode } from '@codefold/react-code-editor';

/** 사용자가 고른 테마. 스토어도 이 타입을 쓴다(services는 store를 import하지 않는다, ADR-0003). */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'codefold:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/** 고른 테마. 처음이거나 읽을 수 없으면(시크릿 모드 제한 등) 시스템이다. */
export function readThemePreference(storage: Storage = localStorage): ThemePreference {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isPreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  value: ThemePreference,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // 저장하지 못해도 이번 세션의 테마는 바뀐다.
  }
}

export function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export function subscribePrefersDark(listener: (dark: boolean) => void): () => void {
  const list = window.matchMedia(DARK_QUERY);
  const onChange = () => listener(list.matches);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** 화면 전체의 CSS 변수 세트(ADR-0002). `<CodeEditor>`가 테마 prop을 받기 전에 불러야 새 변수를 읽는다. */
export function applyThemeClass(
  mode: ThemeMode,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}
