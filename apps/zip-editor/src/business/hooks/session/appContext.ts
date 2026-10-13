// apps/zip-editor/src/business/hooks/session/appContext.ts
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { AppState, AppStore } from '@/store/stores/appStore';
import type { EnvironmentReport } from '../environment/environmentBusiness';
import type { EditorLoader } from '../workspace/editorModule';
import type { SessionFlows } from './sessionFlows';

/** 앱마다 한 벌. AppProviders가 만들고, 테스트는 가짜 서비스로 만든다. */
export interface AppContextValue {
  readonly store: AppStore;
  readonly flows: SessionFlows;
  readonly loadEditor: EditorLoader;
  readonly environment: EnvironmentReport;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProviders 안에서만 쓸 수 있습니다');
  return value;
}

/** 스토어의 한 조각을 구독한다. 선택 함수는 원시 값을 돌려주어 바뀔 때만 다시 그리게 한다. */
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useStore(useAppContext().store, selector);
}
