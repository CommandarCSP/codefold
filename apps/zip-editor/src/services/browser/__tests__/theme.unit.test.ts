// apps/zip-editor/src/services/browser/__tests__/theme.unit.test.ts
import { describe, expect, test } from 'vitest';
import { readThemePreference, THEME_STORAGE_KEY } from '../theme';

const storageWith = (value: string | null) =>
  ({ getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null) }) as Storage;

describe('저장한 테마 읽기', () => {
  test('세 값 가운데 하나면 그 값이고, 아니면 시스템이다', () => {
    expect(readThemePreference(storageWith('dark'))).toBe('dark');
    expect(readThemePreference(storageWith('sepia'))).toBe('system');
    expect(readThemePreference(storageWith(null))).toBe('system');
  });

  test('저장소를 읽을 수 없으면(시크릿 모드 제한 등) 시스템이다', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    expect(readThemePreference(blocked)).toBe('system');
  });
});
