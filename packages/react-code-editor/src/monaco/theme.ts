import type { editor } from 'monaco-editor';
import type { Monaco } from './load-monaco';

export type ThemeMode = 'light' | 'dark';

/** Monaco에 넣을 색(`#rrggbb` 또는 `#rrggbbaa`). 읽지 못한 색은 없다. */
export interface ThemeColors {
  readonly background?: string;
  readonly foreground?: string;
  readonly mutedForeground?: string;
  readonly accent?: string;
  readonly border?: string;
  readonly ring?: string;
  readonly primary?: string;
}

const VARIABLES: Readonly<Record<keyof ThemeColors, string>> = {
  background: '--cf-background',
  foreground: '--cf-foreground',
  mutedForeground: '--cf-muted-foreground',
  accent: '--cf-accent',
  border: '--cf-border',
  ring: '--cf-ring',
  primary: '--cf-primary',
};

/**
 * CSS 색 값을 `#rrggbb`로 바꾼다. 1×1 캔버스에 칠해 읽으므로 `oklch()` 같은 값도 된다.
 * 캔버스가 없는 환경(서버, jsdom)에서는 `undefined`다.
 */
export function cssColorToHex(css: string): string | undefined {
  if (typeof document === 'undefined' || css.trim() === '') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    return undefined;
  }
  if (!context) return undefined;
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
  const part = (value: number) => value.toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}${a < 255 ? part(a) : ''}`;
}

/** `--cf-*` 변수에서 색을 읽는다. */
export function readThemeColors(
  read: (name: string) => string,
  toHex: (css: string) => string | undefined = cssColorToHex,
): ThemeColors {
  const colors: Partial<Record<keyof ThemeColors, string>> = {};
  for (const [key, variable] of Object.entries(VARIABLES) as Array<[keyof ThemeColors, string]>) {
    const value = toHex(read(variable));
    if (value) colors[key] = value;
  }
  return colors;
}

/** 라이트·다크 기본 테마 위에 CSS 변수 색을 얹은 Monaco 테마. */
export function createMonacoTheme(
  mode: ThemeMode,
  colors: ThemeColors,
): editor.IStandaloneThemeData {
  const entries: Array<[string, string | undefined]> = [
    ['editor.background', colors.background],
    ['editor.foreground', colors.foreground],
    ['editorGutter.background', colors.background],
    ['editorLineNumber.foreground', colors.mutedForeground],
    ['editorLineNumber.activeForeground', colors.foreground],
    ['editor.lineHighlightBackground', colors.accent],
    ['editorCursor.foreground', colors.primary],
    ['editorWidget.background', colors.background],
    ['editorWidget.border', colors.border],
    ['editorSuggestWidget.background', colors.background],
    ['editorSuggestWidget.border', colors.border],
    ['focusBorder', colors.ring],
  ];
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: Object.fromEntries(
      entries.filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  };
}

/**
 * `element`의 CSS 변수로 테마를 만들어 적용한다. Monaco 테마는 페이지 전체에 하나라 모든 에디터가 함께 바뀐다.
 * 돌려주는 값은 테마 이름이다.
 */
export function applyMonacoTheme(
  monaco: Pick<Monaco, 'editor'>,
  mode: ThemeMode,
  element: Element,
  toHex: (css: string) => string | undefined = cssColorToHex,
): string {
  const style = getComputedStyle(element);
  const colors = readThemeColors((name) => style.getPropertyValue(name), toHex);
  const name = `codefold-${mode}`;
  monaco.editor.defineTheme(name, createMonacoTheme(mode, colors));
  monaco.editor.setTheme(name);
  return name;
}
