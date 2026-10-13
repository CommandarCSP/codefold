import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAreaContext } from '../area/area-context';
import type { FilePanelParams } from '../area/dockview-area';
import { buttonClass } from '../button-class';
import { FileChangedError } from '../errors';
import type { LoadedFile } from '../types';
import { BinaryView } from './binary-view';
import { ImageView } from './image-view';
import { KindConflictNotice } from './notices';
import { TextView } from './text-view';

type Result =
  | { readonly key: string; readonly status: 'loaded'; readonly file: LoadedFile }
  | { readonly key: string; readonly status: 'failed' };

/** dockview 파일 패널. 파일을 읽어 종류별 보기를 고른다. */
export function FilePanel({ api, params }: IDockviewPanelProps<FilePanelParams>) {
  const { workspace, messages } = useAreaContext();
  const { path } = params;
  const groupId = useSyncExternalStore(
    (onChange) => {
      const subscription = api.onDidGroupChange(onChange);
      return () => subscription.dispose();
    },
    () => api.group.id,
  );
  // dockview는 가려진 탭의 컴포넌트를 지우지 않고 DOM만 뗀다. 다시 보일 때 그룹 에디터를 붙이려고 본다.
  const visible = useSyncExternalStore(
    (onChange) => {
      const subscription = api.onDidVisibilityChange(onChange);
      return () => subscription.dispose();
    },
    () => api.isVisible,
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>();
  const key = `${path}\u0000${attempt}`;

  useEffect(() => {
    let active = true;
    workspace.loadFile(path).then(
      (file) => {
        if (active) setResult({ key, status: 'loaded', file });
      },
      (error: unknown) => {
        // 읽는 도중 이름이 바뀌었으면 새 경로로 다시 읽는다(params가 바뀌어 이 effect가 다시 돈다).
        if (active && !(error instanceof FileChangedError)) setResult({ key, status: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [workspace, path, key]);

  const retry = () => setAttempt((count) => count + 1);
  const current = result?.key === key ? result : undefined;

  if (!current) {
    // 대부분의 파일은 곧바로 열리므로, 안내는 늦어질 때만 보인다(cf-delayed-reveal). 스쳐 지나가면 깜박임처럼 보인다.
    return (
      <div className="cf-delayed-reveal cf:flex cf:h-full cf:items-center cf:justify-center cf:bg-background cf:text-sm cf:text-muted-foreground">
        {messages.fileLoading}
      </div>
    );
  }
  if (current.status === 'failed') {
    return (
      <div className="cf:flex cf:h-full cf:flex-col cf:items-center cf:justify-center cf:gap-3 cf:text-sm">
        <p role="alert">{messages.readFailed}</p>
        <button type="button" className={buttonClass('outline')} onClick={retry}>
          {messages.retry}
        </button>
      </div>
    );
  }
  const { file } = current;
  return (
    <div className="cf:flex cf:h-full cf:min-h-0 cf:flex-col cf:bg-background">
      <KindConflictNotice messages={messages} detected={file.detected} />
      <div className="cf:min-h-0 cf:flex-1">
        {file.kind === 'text' && (
          <TextView
            panelId={api.id}
            groupId={groupId}
            path={path}
            visible={visible}
            onMissing={retry}
          />
        )}
        {file.kind === 'image' && (
          <ImageView
            panelId={api.id}
            groupId={groupId}
            file={file}
            visible={visible}
            onMissing={retry}
          />
        )}
        {file.kind === 'binary' && (
          <BinaryView
            messages={messages}
            detected={file.detected}
            size={workspace.fs.getNode(path)?.size ?? 0}
          />
        )}
      </div>
    </div>
  );
}
