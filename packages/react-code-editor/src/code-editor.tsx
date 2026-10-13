import type { EditorOptions, WorkerFactory } from '@codefold/monaco-binding';
import type { FileSource } from '@codefold/virtual-fs';
import { useEffect, useRef, useState } from 'react';
import { EditorArea } from './area/editor-area';
import { cn } from './cn';
import { createAreaSlot, createController, type CodeEditorController } from './controller';
import { resolveMessages, type CodeEditorMessages } from './messages';
import { loadMonaco, type Monaco } from './monaco/load-monaco';
import { applyMonacoTheme, type ThemeMode } from './monaco/theme';
import { FileTreePanel } from './tree/file-tree-panel';
import type { WorkspaceSnapshot } from './types';
import { createEditorWorkspace, type EditorWorkspace } from './workspace';

export interface CodeEditorProps {
  /** 파일 출처. 바꾸면 작업 공간을 새로 만든다(새 ZIP). */
  readonly source: FileSource;
  /** Monaco worker 생성 함수(ADR-0021). */
  readonly createWorker: WorkerFactory;
  /** 앱이 "시스템"을 해석해서 넘긴다. 기본은 라이트다. */
  readonly theme?: ThemeMode;
  /** 바꿀 문구만 넘긴다(ADR-0015). */
  readonly messages?: Partial<CodeEditorMessages>;
  /** 복원할 때만. 작업 공간을 만들 때(처음 마운트, `source`를 바꿀 때) 그때의 값을 쓴다. */
  readonly initialSnapshot?: WorkspaceSnapshot;
  readonly onReady?: (controller: CodeEditorController) => void;
  /** 작업 공간을 만들지 못했다(복원 실패 등). */
  readonly onError?: (error: unknown) => void;
  /** `'overlay'`면 트리가 에디터 위에 겹쳐 열린다. */
  readonly treeMode?: 'docked' | 'overlay';
  readonly treeOpen?: boolean;
  readonly onTreeOpenChange?: (open: boolean) => void;
  readonly editorOptions?: EditorOptions;
  readonly className?: string;
}

interface Session {
  readonly id: number;
  readonly monaco: Monaco;
  readonly workspace: EditorWorkspace;
  /** 이 작업 공간을 만들 때 쓴 스냅샷. 레이아웃도 여기서 되살린다. */
  readonly snapshot: WorkspaceSnapshot | undefined;
}

/** 작업 공간마다 오르는 번호. Workbench를 작업 공간마다 새로 마운트하는 key로 쓴다. */
let sessionCount = 0;

/**
 * 완성형 코드 에디터(ADR-0022). Monaco를 필요할 때 불러오고, 작업 공간과 트리·에디터 영역을 조립한다.
 * 다운로드·자동 저장은 하지 않는다. 앱이 `onReady`로 받은 제어 API로 만든다.
 */
export function CodeEditor(props: CodeEditorProps) {
  const {
    source,
    createWorker,
    theme = 'light',
    messages: overrides,
    onReady,
    onError,
    className,
  } = props;
  const messages = resolveMessages(overrides);
  const [session, setSession] = useState<Session>();
  const root = useRef<HTMLDivElement>(null);
  // 작업 공간을 만들 때만 읽는 prop과 콜백은 ref로 잡아, effect가 이 값들 때문에 다시 돌지 않게 한다.
  const { initialSnapshot } = props;
  const latest = useRef({ initialSnapshot, createWorker, onError, onReady });
  useEffect(() => {
    latest.current = { initialSnapshot, createWorker, onError, onReady };
  });
  // 앞 작업 공간을 다 지운 뒤에 다음을 만든다(StrictMode 이중 마운트, 새 ZIP).
  const previous = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    let created: EditorWorkspace | undefined;
    const run = previous.current.then(async () => {
      if (cancelled) return;
      try {
        const monaco = await loadMonaco(latest.current.createWorker);
        const snapshot = latest.current.initialSnapshot;
        const workspace = await createEditorWorkspace({
          source,
          monaco,
          initialSnapshot: snapshot,
        });
        if (cancelled) {
          workspace.dispose();
          return;
        }
        created = workspace;
        sessionCount += 1;
        setSession({ id: sessionCount, monaco, workspace, snapshot });
      } catch (error) {
        if (!cancelled) latest.current.onError?.(error);
      }
    });
    return () => {
      cancelled = true;
      setSession(undefined);
      previous.current = run.then(() => created?.dispose());
    };
  }, [source]);

  useEffect(() => {
    const element = root.current;
    if (!session || !element) return;
    const apply = () => applyMonacoTheme(session.monaco, theme, element);
    apply();
    // 앱은 보통 자기 effect에서 html·body의 class(.dark)를 바꾸는데, 이 effect가 먼저 돌아 옛 색을 읽는다.
    // CSS 변수를 바꿀 만한 속성이 바뀌면 다시 읽는다.
    const observer = new MutationObserver(apply);
    const attributeFilter = ['class', 'style', 'data-theme'];
    observer.observe(document.documentElement, { attributes: true, attributeFilter });
    observer.observe(document.body, { attributes: true, attributeFilter });
    return () => observer.disconnect();
  }, [session, theme]);

  return (
    <div
      ref={root}
      className={cn(
        'cf:relative cf:flex cf:h-full cf:min-h-0 cf:w-full cf:bg-background cf:text-foreground',
        className,
      )}
    >
      {session ? (
        <Workbench {...props} key={session.id} messages={messages} session={session} />
      ) : (
        <div className="cf:flex cf:flex-1 cf:items-center cf:justify-center cf:text-sm cf:text-muted-foreground">
          {messages.editorLoading}
        </div>
      )}
    </div>
  );
}

interface WorkbenchProps extends Omit<CodeEditorProps, 'messages'> {
  readonly messages: CodeEditorMessages;
  readonly session: Session;
}

function Workbench({
  session,
  messages,
  treeMode = 'docked',
  treeOpen = true,
  onTreeOpenChange,
  editorOptions,
  onReady,
}: WorkbenchProps) {
  const { workspace, monaco, snapshot } = session;
  // 제어 API는 작업 공간마다 하나다. dockview가 영역을 다시 만들어도(StrictMode) 같은 제어 API가 새 영역을 쓰고,
  // onReady는 한 번만 부른다.
  const [slot] = useState(createAreaSlot);
  const [controller] = useState(() => createController(workspace, slot));
  const announced = useRef(false);
  // 좁은 화면에서 트리가 열린 동안 파일을 고르면 트리를 닫게 알린다. 활성 탭이 바뀌는지가 아니라
  // 여는 요청을 들어, 트리를 열 때 이미 활성인 탭이 있어도 곧바로 닫지 않고, 같은 파일을 다시 골라도 닫는다.
  useEffect(() => {
    if (treeMode !== 'overlay' || !treeOpen) return;
    const subscription = workspace.onFileOpen(() => onTreeOpenChange?.(false));
    return () => subscription.dispose();
  }, [workspace, treeMode, treeOpen, onTreeOpenChange]);

  const tree = <FileTreePanel workspace={workspace} messages={messages} className="cf:h-full" />;
  return (
    <>
      {treeMode === 'docked' ? (
        <aside className="cf:h-full cf:w-64 cf:shrink-0 cf:border-r cf:border-border">{tree}</aside>
      ) : (
        treeOpen && (
          <aside className="cf:absolute cf:inset-y-0 cf:left-0 cf:z-20 cf:w-72 cf:max-w-[85%] cf:border-r cf:border-border cf:bg-background cf:shadow-lg">
            {tree}
          </aside>
        )
      )}
      <main className="cf:h-full cf:min-w-0 cf:flex-1">
        <EditorArea
          workspace={workspace}
          monaco={monaco}
          messages={messages}
          editorOptions={editorOptions}
          initialLayout={snapshot?.layout ?? undefined}
          onReady={(area) => {
            slot.set(area);
            if (announced.current) return;
            announced.current = true;
            onReady?.(controller);
          }}
        />
      </main>
    </>
  );
}
