import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { X } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { formatMessage } from '../messages';
import { useAreaContext } from './area-context';
import type { FilePanelParams } from './dockview-area';

/** 탭 하나. 이름, 수정 표시, 닫기 버튼. 탭은 자기 경로의 수정 여부만 구독한다. */
export function FileTab({ api, params }: IDockviewPanelHeaderProps<FilePanelParams>) {
  const { workspace, messages } = useAreaContext();
  const title = useSyncExternalStore(
    (onChange) => {
      const subscription = api.onDidTitleChange(onChange);
      return () => subscription.dispose();
    },
    () => api.title ?? '',
  );
  const modified = useStore(workspace.store, (state) => state.dirty[params.path] === true);
  const root = useRef<HTMLDivElement>(null);
  // 탭이 넘쳐 탭 줄이 스크롤되면, 방금 활성이 된 탭이 가려질 수 있다. 활성이 되면 보이게 스크롤한다.
  useEffect(() => {
    const reveal = () => {
      if (api.isActive) root.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };
    reveal();
    const subscription = api.onDidActiveChange(reveal);
    return () => subscription.dispose();
  }, [api]);
  return (
    <div
      ref={root}
      // 탭 여백은 여기서만 준다. dockview의 .dv-tab 여백은 styles.css에서 없앤다.
      className="cf:flex cf:h-full cf:items-center cf:gap-1.5 cf:pr-1.5 cf:pl-3 cf:text-[13px]"
      title={params.path}
    >
      <span className="cf:truncate">{title}</span>
      {modified && (
        <>
          <span aria-hidden className="cf:size-2 cf:shrink-0 cf:rounded-full cf:bg-modified" />
          <span className="cf:sr-only">{messages.modified}</span>
        </>
      )}
      <button
        type="button"
        aria-label={formatMessage(messages.closeTab, { name: title })}
        title={formatMessage(messages.closeTab, { name: title })}
        className="cf:inline-flex cf:size-6 cf:shrink-0 cf:items-center cf:justify-center cf:rounded-sm cf:text-muted-foreground cf:hover:bg-accent cf:hover:text-foreground"
        // 탭 끌기와 활성화가 닫기 버튼에서 시작되지 않게 한다.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          api.close();
        }}
      >
        <X aria-hidden className="cf:size-3.5" />
      </button>
    </div>
  );
}
