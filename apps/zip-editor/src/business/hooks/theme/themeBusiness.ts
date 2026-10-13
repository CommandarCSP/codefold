// apps/zip-editor/src/business/hooks/theme/themeBusiness.ts
import type { ThemeMode } from '@codefold/react-code-editor';
import type { ThemePreference } from '@/store/stores/appStore';

/** "시스템"은 운영체제 설정을 따른다. `<CodeEditor theme>`에는 이 결과를 넘긴다. */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ThemeMode {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}
