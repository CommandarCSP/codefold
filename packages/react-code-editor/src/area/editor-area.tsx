import type { EditorOptions, MonacoApi } from '@codefold/monaco-binding';
import type { Disposable } from '@codefold/virtual-fs';
import { DockviewReact, type DockviewReadyEvent, type DockviewTheme } from 'dockview-react';
import { useEffect, useState } from 'react';
import { cn } from '../cn';
import type { CodeEditorMessages } from '../messages';
import { FilePanel } from '../views/file-panel';
import type { EditorWorkspace } from '../workspace';
import { AreaContext } from './area-context';
import { createDockviewArea, FILE_PANEL, type DockviewArea } from './dockview-area';
import { EmptyHint } from './empty-hint';
import { FileTab } from './file-tab';
import { GroupActions } from './group-actions';

export interface EditorAreaProps {
  readonly workspace: EditorWorkspace;
  readonly monaco: MonacoApi;
  readonly messages: CodeEditorMessages;
  readonly editorOptions?: EditorOptions;
  /** 되살릴 배치(dockview JSON). */
  readonly initialLayout?: unknown;
  readonly onReady?: (area: DockviewArea) => void;
  readonly className?: string;
}

const COMPONENTS = { [FILE_PANEL]: FilePanel };

/**
 * dockview는 `theme`가 없으면 안쪽 요소에 어두운 기본 테마(abyss)를 붙여, 바깥에서 정한 색 변수를 덮는다.
 * 그러면 새 탭의 내용이 그려지기 전 잠깐 어두운 배경이 비친다. 그래서 에디터 색 변수(`.cf-dockview`)를 테마로 넘긴다.
 */
const THEME: DockviewTheme = { name: 'codefold', className: 'dockview-theme-light cf-dockview' };

/** dockview로 그린 에디터 영역(ADR-0007). 준비되면 작업 공간에 붙이고 `onReady`로 알린다. */
export function EditorArea({
  workspace,
  monaco,
  messages,
  editorOptions,
  initialLayout,
  onReady,
  className,
}: EditorAreaProps) {
  const [ready, setReady] = useState<{
    readonly area: DockviewArea;
    readonly detach: Disposable;
  }>();

  // 영역을 뗄 때(언마운트, 작업 공간 교체) 에디터와 탭 수를 정리한다.
  useEffect(
    () => () => {
      ready?.detach.dispose();
      ready?.area.dispose();
    },
    [ready],
  );

  const handleReady = (event: DockviewReadyEvent) => {
    const area = createDockviewArea({ api: event.api, workspace, monaco, editorOptions });
    const detach = workspace.attachArea(area);
    if (initialLayout) area.restoreLayout(initialLayout);
    setReady({ area, detach });
    onReady?.(area);
  };

  return (
    <AreaContext value={{ workspace, area: ready?.area, messages }}>
      <div className={cn('cf:h-full cf:w-full', className)}>
        <DockviewReact
          components={COMPONENTS}
          theme={THEME}
          // 떠 있는 그룹은 두지 않는다(ADR-0042). Shift+클릭·끌기로 띄우는 길도 막는다.
          disableFloatingGroups
          defaultTabComponent={FileTab}
          rightHeaderActionsComponent={GroupActions}
          watermarkComponent={EmptyHint}
          onReady={handleReady}
        />
      </div>
    </AreaContext>
  );
}
