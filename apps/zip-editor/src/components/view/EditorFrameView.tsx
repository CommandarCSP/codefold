// apps/zip-editor/src/components/view/EditorFrameView.tsx
import type { ReactNode } from 'react';
import { OpeningStateView } from './OpeningStateView';

export interface EditorFrameViewProps {
  /** 새 ZIP을 여는 동안 옛 에디터 위에 로딩을 덮는다. 옛 에디터는 그대로 둔다. */
  readonly busy: boolean;
  readonly children: ReactNode;
}

export function EditorFrameView({ busy, children }: EditorFrameViewProps) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1" aria-busy={busy || undefined}>
      {children}
      {busy && (
        <div className="absolute inset-0 z-30 flex bg-background/70">
          <OpeningStateView />
        </div>
      )}
    </div>
  );
}
