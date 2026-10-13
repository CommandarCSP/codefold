// apps/zip-editor/src/business/hooks/theme/__tests__/themeBusiness.test.ts
import { describe, expect, test } from 'vitest';
import { resolveTheme } from '../themeBusiness';

describe('테마 규칙', () => {
  test('시스템이면 운영체제 설정을 따르고, 아니면 고른 값이다', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
