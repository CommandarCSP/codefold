import { describe, expect, test, vi } from 'vitest';
import { applyMonacoTheme, createMonacoTheme, readThemeColors } from '../src/monaco/theme';

const vars: Record<string, string> = {
  '--cf-background': 'white',
  '--cf-foreground': 'black',
  '--cf-muted-foreground': 'gray',
  '--cf-accent': 'whitesmoke',
  '--cf-border': 'silver',
  '--cf-ring': 'blue',
  '--cf-primary': 'navy',
};
const hex: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  gray: '#808080',
  whitesmoke: '#f5f5f5',
  silver: '#c0c0c0',
  blue: '#0000ff',
  navy: '#000080',
};

describe('테마', () => {
  test('CSS 변수에서 색을 읽어 #rrggbb로 바꾼다', () => {
    const colors = readThemeColors(
      (name) => vars[name] ?? '',
      (css) => hex[css.trim()],
    );
    expect(colors).toEqual({
      background: '#ffffff',
      foreground: '#000000',
      mutedForeground: '#808080',
      accent: '#f5f5f5',
      border: '#c0c0c0',
      ring: '#0000ff',
      primary: '#000080',
    });
  });

  test('읽지 못한 색은 넣지 않는다', () => {
    expect(
      readThemeColors(
        () => '',
        () => undefined,
      ),
    ).toEqual({});
  });

  test('Monaco 테마는 라이트·다크 기본 테마 위에 CSS 변수 색을 얹는다', () => {
    const theme = createMonacoTheme('dark', {
      background: '#101010',
      foreground: '#fafafa',
      ring: '#3366ff',
    });
    expect(theme.base).toBe('vs-dark');
    expect(theme.inherit).toBe(true);
    expect(theme.colors).toMatchObject({
      'editor.background': '#101010',
      'editor.foreground': '#fafafa',
      focusBorder: '#3366ff',
    });
    expect(createMonacoTheme('light', {}).base).toBe('vs');
    expect(createMonacoTheme('light', {}).colors).toEqual({});
  });

  test('테마를 정의하고 모든 에디터에 적용한다', () => {
    const editor = { defineTheme: vi.fn(), setTheme: vi.fn() };
    const element = document.createElement('div');
    const name = applyMonacoTheme({ editor } as never, 'dark', element, () => undefined);
    expect(name).toBe('codefold-dark');
    expect(editor.defineTheme).toHaveBeenCalledWith(
      'codefold-dark',
      expect.objectContaining({ base: 'vs-dark' }),
    );
    expect(editor.setTheme).toHaveBeenCalledWith('codefold-dark');
  });
});
