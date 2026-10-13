// apps/zip-editor/src/AppProviders.tsx
import NiceModal from '@ebay/nice-modal-react';
import { useState, type ReactNode } from 'react';
import {
  checkEnvironment,
  type EnvironmentReport,
} from '@/business/hooks/environment/environmentBusiness';
import { createSessionDialogs } from '@/business/hooks/modal/sessionDialogs';
import { AppContext, type AppContextValue } from '@/business/hooks/session/appContext';
import type { SessionDialogs } from '@/business/hooks/session/flowContext';
import { createSessionFlows } from '@/business/hooks/session/sessionFlows';
import { loadEditorModule, type EditorLoader } from '@/business/hooks/workspace/editorModule';
import { loadEditorHost } from '@/components/domain/workspace/loadEditorHost';
import { createBrowserServices, type AppServices } from '@/services/appServices';
import { prefersDark, readThemePreference } from '@/services/browser/theme';
import { createAppStore, type AppStore } from '@/store/stores/appStore';

export interface AppProvidersProps {
  readonly children: ReactNode;
  /** 테스트만 넘긴다. 없으면 실제 브라우저 기능을 쓴다. */
  readonly services?: AppServices;
  readonly dialogs?: SessionDialogs;
  readonly loadEditor?: EditorLoader;
  readonly store?: AppStore;
  readonly environment?: EnvironmentReport;
}

/** 스토어·흐름·에디터 청크 불러오기를 앱마다 한 번 만든다. */
export function AppProviders({
  children,
  services,
  dialogs,
  loadEditor = loadEditorHost,
  store,
  environment,
}: AppProvidersProps) {
  const [value] = useState<AppContextValue>(() => {
    const appStore =
      store ?? createAppStore({ theme: readThemePreference(), systemDark: prefersDark() });
    const flows = createSessionFlows({
      store: appStore,
      services: services ?? createBrowserServices(),
      dialogs: dialogs ?? createSessionDialogs(),
      preloadEditor: () => {
        // 실패는 그리는 쪽(use)이 다시 던져 에러 경계가 보인다. 여기서는 삼킨다.
        loadEditorModule(loadEditor).catch(() => undefined);
      },
    });
    return {
      store: appStore,
      flows,
      loadEditor,
      environment: environment ?? checkEnvironment(globalThis),
    };
  });
  return (
    <NiceModal.Provider>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </NiceModal.Provider>
  );
}
