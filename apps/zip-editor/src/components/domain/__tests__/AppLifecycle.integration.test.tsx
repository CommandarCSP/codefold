// apps/zip-editor/src/components/domain/__tests__/AppLifecycle.integration.test.tsx
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AUTOSAVE_HINT_MS } from '@/business/hooks/lifecycle/useAppLifecycle';
import { THEME_STORAGE_KEY } from '@/services/browser/theme';
import { createFakeController, zipFile } from '@/test/fakes';
import { installMatchMedia } from '@/test/media';
import { renderApp } from '@/test/renderApp';
import { messages } from '@/utils/messages';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const headerUpload = () => within(screen.getByRole('banner')).getByLabelText(messages.upload);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openedApp(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(options);
  await screen.findByRole('heading', { name: messages.empty.title });
  await app.user.upload(headerUpload(), zipFile());
  await screen.findByTestId('editor-host');
  return app;
}

describe('테마', () => {
  test('다크를 고르면 .dark가 먼저 켜지고 에디터 테마도 바뀌며, 고른 값이 새로고침 뒤에도 남는다', async () => {
    const app = await openedApp();
    await app.user.click(screen.getByRole('button', { name: messages.theme.label }));
    await app.user.click(await screen.findByRole('menuitemradio', { name: messages.theme.dark }));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByTestId('editor-host')).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    cleanup();
    document.documentElement.className = '';
    const again = renderApp();
    expect(again.store.getState().theme).toBe('dark');
  });

  test('시스템을 고른 상태에서 운영체제 테마가 바뀌면 새로고침 없이 따라간다', async () => {
    const media = installMatchMedia({ [DARK_QUERY]: false });
    await openedApp();
    expect(screen.getByTestId('editor-host')).toHaveAttribute('data-theme', 'light');
    act(() => media.set(DARK_QUERY, true));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByTestId('editor-host')).toHaveAttribute('data-theme', 'dark');
  });
});

describe('창 이벤트', () => {
  test('작업 공간이 열려 있으면 Ctrl/Cmd+S를 막고 자동 저장 안내를 잠깐 보인다', async () => {
    await openedApp();
    vi.useFakeTimers();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    // 잠깐 보였다 사라지는 안내라 레이아웃 흐름 밖(fixed)에 띄운다. 흐름 안이면 에디터가 밀렸다 돌아온다.
    expect(screen.getByText(messages.autosaveHint).closest('.fixed')).not.toBeNull();
    act(() => vi.advanceTimersByTime(AUTOSAVE_HINT_MS));
    expect(screen.queryByText(messages.autosaveHint)).toBeNull();
  });

  test('작업 공간이 없으면 Ctrl/Cmd+S를 막지 않는다', async () => {
    renderApp();
    await screen.findByRole('heading', { name: messages.empty.title });
    const event = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('저장 전이면 이탈 경고, 모두 저장됐으면 없음. 받지 않은 변경만으로는 경고하지 않는다', async () => {
    const app = await openedApp({
      makeController: () => createFakeController({ contents: { 'a.txt': '고침' } }),
    });
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    act(() => app.controllers[0]?.emit.unexported({ has: true, count: 1 }));
    expect(unload()).toBe(false);
    act(() => app.controllers[0]?.emit.content('a.txt'));
    expect(unload()).toBe(true);
    await waitFor(() => expect(app.store.getState().saveStatus).toBe('saved'), { timeout: 3000 });
    expect(unload()).toBe(false);
  });

  test('탭이 숨겨지면 1초를 기다리지 않고 저장한다', async () => {
    const app = await openedApp({
      makeController: () => createFakeController({ contents: { 'a.txt': '고침' } }),
    });
    act(() => app.controllers[0]?.emit.content('a.txt'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(app.services.repository.files.get('a.txt')).toBe('고침'), {
      timeout: 500,
    });
  });
});
