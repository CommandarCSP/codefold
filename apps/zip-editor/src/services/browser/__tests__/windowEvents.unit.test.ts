// apps/zip-editor/src/services/browser/__tests__/windowEvents.unit.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { subscribeBeforeUnload, subscribeVisibilityHidden } from '../pageLifecycle';
import { subscribeSaveShortcut } from '../saveShortcut';
import {
  applyThemeClass,
  readThemePreference,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from '../theme';

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
});

const keydown = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  window.dispatchEvent(event);
  return event;
};

describe('Ctrl/Cmd+S', () => {
  test('처리기가 true를 돌려주면 브라우저 저장 창을 막는다. Ctrl과 Cmd 둘 다', () => {
    const handler = vi.fn(() => true);
    const subscription = subscribeSaveShortcut(handler);
    disposers.push(() => subscription.dispose());
    expect(keydown({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(keydown({ key: 'S', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('다른 키, Alt 조합, false를 돌려주면 막지 않는다', () => {
    const handler = vi.fn(() => false);
    const subscription = subscribeSaveShortcut(handler);
    disposers.push(() => subscription.dispose());
    expect(keydown({ key: 'a', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(keydown({ key: 's', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(keydown({ key: 's', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('이탈 경고와 탭 숨김', () => {
  test('경고해야 할 때만 beforeunload를 막는다', () => {
    let warn = false;
    const subscription = subscribeBeforeUnload(() => warn);
    disposers.push(() => subscription.dispose());
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    warn = true;
    const loud = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(loud);
    expect(loud.defaultPrevented).toBe(true);
  });

  test('visibilitychange가 오지 않는 브라우저를 위해 pagehide에도 부르고, 풀면 부르지 않는다', () => {
    const handler = vi.fn();
    const subscription = subscribeVisibilityHidden(handler);
    window.dispatchEvent(new Event('pagehide'));
    expect(handler).toHaveBeenCalledTimes(1);
    subscription.dispose();
    window.dispatchEvent(new Event('pagehide'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('탭이 숨겨질 때만 부른다', () => {
    const handler = vi.fn();
    const subscription = subscribeVisibilityHidden(handler);
    disposers.push(() => subscription.dispose());
    const state = vi.spyOn(document, 'visibilityState', 'get');
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(handler).not.toHaveBeenCalled();
    state.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('테마 저장과 적용', () => {
  test('처음 값은 시스템이고, 모르는 값이나 읽기 실패도 시스템이다', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');
    writeThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('막힘', 'SecurityError');
    });
    expect(readThemePreference()).toBe('system');
  });

  test('다크면 .dark 클래스와 color-scheme을 켜고, 라이트면 끈다', () => {
    applyThemeClass('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyThemeClass('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
