// apps/zip-editor/src/test/renderApp.tsx
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { vi, type Mock } from 'vitest';
import { AppProviders } from '@/AppProviders';
import type { EnvironmentReport } from '@/business/hooks/environment/environmentBusiness';
import type { EditorHostProps, EditorLoader } from '@/business/hooks/workspace/editorModule';
import '@/modals/registry';
import { EditorPage } from '@/pages/EditorPage';
import { prefersDark, readThemePreference } from '@/services/browser/theme';
import { createAppStore, type AppState, type AppStore } from '@/store/stores/appStore';
import {
  createFakeController,
  createFakeServices,
  type FakeController,
  type FakeServices,
} from './fakes';

export interface AppHarness {
  readonly store: AppStore;
  readonly services: FakeServices;
  /** 가짜 에디터가 onReady로 넘긴 제어 API. 작업 공간 순서대로 쌓인다. */
  readonly controllers: FakeController[];
  readonly loadEditor: Mock<EditorLoader>;
  readonly user: ReturnType<typeof userEvent.setup>;
}

/** 실제 AppProviders·흐름·스토어·nice-modal에 가짜 서비스와 가짜 에디터만 넣어 페이지를 그린다. */
export function renderApp(
  options: {
    services?: FakeServices;
    state?: Partial<AppState>;
    makeController?: () => FakeController;
    environment?: EnvironmentReport;
  } = {},
): AppHarness {
  const services = options.services ?? createFakeServices();
  const store = createAppStore({
    theme: readThemePreference(),
    systemDark: prefersDark(),
    ...options.state,
  });
  const controllers: FakeController[] = [];
  const makeController = options.makeController ?? (() => createFakeController());

  function FakeEditorHost({ workspace, theme, narrow, treeOpen, onReady }: EditorHostProps) {
    const [controller] = useState(makeController);
    useEffect(() => {
      if (!controllers.includes(controller)) controllers.push(controller);
      onReady(workspace.id, controller);
    }, [controller, onReady, workspace.id]);
    return (
      <div
        data-testid="editor-host"
        data-workspace={workspace.id}
        data-theme={theme}
        data-narrow={String(narrow)}
        data-tree-open={String(treeOpen)}
      >
        {workspace.zipName}
      </div>
    );
  }

  const loadEditor = vi.fn<EditorLoader>(async () => ({ EditorHost: FakeEditorHost }));
  const user = userEvent.setup();
  render(
    <AppProviders
      services={services}
      store={store}
      loadEditor={loadEditor}
      environment={options.environment ?? { kind: 'ok' }}
    >
      <EditorPage />
    </AppProviders>,
  );
  return { store, services, controllers, loadEditor, user };
}
