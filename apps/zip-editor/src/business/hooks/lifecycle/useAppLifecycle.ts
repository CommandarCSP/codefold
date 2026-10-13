// apps/zip-editor/src/business/hooks/lifecycle/useAppLifecycle.ts
import { useEffect } from 'react';
import { subscribeBeforeUnload, subscribeVisibilityHidden } from '@/services/browser/pageLifecycle';
import { subscribeSaveShortcut } from '@/services/browser/saveShortcut';
import { useAppContext } from '../session/appContext';
import { shouldWarnBeforeUnload } from '../session/sessionBusiness';

/** Ctrl/Cmd+S를 누른 뒤 자동 저장 안내를 보이는 시간. */
export const AUTOSAVE_HINT_MS = 2000;

/**
 * 앱이 사는 동안 한 번 거는 것: 흐름 시작, 이탈 경고, 탭 숨김 저장, Ctrl/Cmd+S.
 * - 2026-09 · ADR-0014: 이탈 경고는 저장 상태 하나만 본다. 받지 않은 변경으로는 띄우지 않는다.
 * - 2026-09 · 사용자 결정 ND-4: Ctrl/Cmd+S는 작업 공간이 열려 있을 때만 가로챈다. 다운로드는 하지 않는다.
 */
export function useAppLifecycle(): void {
  const { flows, store } = useAppContext();
  useEffect(() => {
    void flows.start();
  }, [flows]);
  useEffect(() => {
    let hideHint: ReturnType<typeof setTimeout> | undefined;
    const subscriptions = [
      subscribeBeforeUnload(() => shouldWarnBeforeUnload(store.getState())),
      subscribeVisibilityHidden(() => flows.flushNow()),
      subscribeSaveShortcut(() => {
        if (!store.getState().workspace) return false;
        store.setState({ autosaveHint: true });
        clearTimeout(hideHint);
        hideHint = setTimeout(() => store.setState({ autosaveHint: false }), AUTOSAVE_HINT_MS);
        return true;
      }),
    ];
    return () => {
      clearTimeout(hideHint);
      for (const subscription of subscriptions) subscription.dispose();
    };
  }, [flows, store]);
}
