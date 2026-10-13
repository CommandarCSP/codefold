// apps/zip-editor/src/store/stores/__tests__/appStore.unit.test.ts
import { describe, expect, test } from 'vitest';
import { createAppStore, initialAppState } from '../appStore';

describe('앱 UI 스토어', () => {
  test('처음 값: 잠금 판정 전, 저장됨, 테마는 시스템, 트리 패널 닫힘', () => {
    const store = createAppStore();
    expect(store.getState()).toEqual(initialAppState);
    expect(store.getState()).toMatchObject({
      phase: 'booting',
      lock: 'pending',
      saveStatus: 'saved',
      theme: 'system',
      treeOpen: false,
      unexported: { has: false, count: 0 },
    });
  });

  test('처음 값 일부를 바꿔 만들 수 있고, setState는 합친다', () => {
    const store = createAppStore({ theme: 'dark', systemDark: true });
    store.setState({ downloading: true });
    expect(store.getState()).toMatchObject({
      theme: 'dark',
      systemDark: true,
      downloading: true,
      phase: 'booting',
    });
  });

  test('스토어마다 상태가 따로다', () => {
    const a = createAppStore();
    const b = createAppStore();
    a.setState({ phase: 'ready' });
    expect(b.getState().phase).toBe('booting');
  });
});
