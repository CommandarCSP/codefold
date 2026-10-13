// apps/zip-editor/src/components/view/AppShellView.tsx
import type { ReactNode } from 'react';

export interface AppShellViewProps {
  readonly header: ReactNode;
  readonly banner?: ReactNode;
  readonly notices?: ReactNode;
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
}

/** 화면 배치: 위에 상단 막대, 아래에 본문. 본문 높이를 화면 높이로 정해 트리 가상화가 행 수를 셀 수 있게 한다. */
export function AppShellView({ header, banner, notices, overlay, children }: AppShellViewProps) {
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      {header}
      {banner}
      {notices}
      <main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
      {overlay}
    </div>
  );
}
