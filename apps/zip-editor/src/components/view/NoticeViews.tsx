// apps/zip-editor/src/components/view/NoticeViews.tsx
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messages } from '@/utils/messages';

/** 상단 막대 아래 상태 알림 줄(읽기 전용). 알림이 없으면 자리를 차지하지 않는다. */
export function NoticeStackView({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col gap-2 px-3 py-2 empty:hidden">{children}</div>;
}

/**
 * 화면 아래 가운데에 떠 있는 알림 목록. 레이아웃 흐름 밖에 있어 알림이 생기고 사라져도 에디터를 밀지 않는다.
 * 목록의 빈 곳은 포인터 이벤트를 받지 않아 뒤의 에디터를 그대로 누를 수 있다.
 */
export function FloatingNoticesView({ children }: { readonly children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 empty:hidden">
      {children}
    </div>
  );
}

const icons = { error: CircleAlert, warning: TriangleAlert, info: Info } as const;

export interface NoticeAlertViewProps {
  readonly tone: 'error' | 'warning' | 'info';
  /** 곧바로 읽어야 하면 alert, 아니면 status. */
  readonly role: 'alert' | 'status';
  readonly message: string;
  readonly detail?: string;
}

export function NoticeAlertView({ tone, role, message, detail }: NoticeAlertViewProps) {
  const Icon = icons[tone];
  return (
    <Alert role={role} variant={tone === 'error' ? 'destructive' : 'default'}>
      <Icon aria-hidden />
      <AlertTitle>{message}</AlertTitle>
      {detail && <AlertDescription>{detail}</AlertDescription>}
    </Alert>
  );
}

/** 잠깐 보였다 저절로 사라지는 안내(예: Ctrl/Cmd+S). 누르는 것을 가리지 않도록 포인터 이벤트를 받지 않는다. */
export function NoticeToastView({ message }: { readonly message: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
    >
      <Info aria-hidden className="size-4 text-muted-foreground" />
      {message}
    </div>
  );
}

const toneIconClass = {
  error: 'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-muted-foreground',
} as const;

export interface FloatingNoticeViewProps extends NoticeAlertViewProps {
  /** 알림에 붙는 동작(예: 다운로드 다시 시도). */
  readonly action?: { readonly label: string; readonly onClick: () => void };
  readonly onDismiss: () => void;
}

/**
 * 사용자가 닫을 때까지 남는 사건 알림(업로드 오류, 큰 ZIP 경고, 다운로드 실패).
 * 오류는 저절로 사라지면 놓치기 쉬워 시간이 지나도 닫지 않는다.
 */
export function FloatingNoticeView({
  tone,
  role,
  message,
  detail,
  action,
  onDismiss,
}: FloatingNoticeViewProps) {
  const Icon = icons[tone];
  return (
    <div
      role={role}
      className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', toneIconClass[tone])} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
        {detail && <p className="mt-1 text-muted-foreground">{detail}</p>}
        {action && (
          <Button variant="outline" size="sm" className="mt-2" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-my-1 -mr-1 shrink-0"
        aria-label={messages.dismissNotice}
        onClick={onDismiss}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}

/** 저장할 수 없을 때. */
export function StorageWarningBannerView() {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {messages.storageUnavailable}
    </div>
  );
}

/** 라이브 영역에 읽을 안내. 스토어의 Announcement와 같은 모양이다(view는 store를 import하지 않는다, ADR-0003). */
export interface LiveAnnouncement {
  readonly id: number;
  readonly text: string;
}

/** 늘 DOM에 있는 라이브 영역. `id`가 바뀌면 같은 문구도 다시 읽는다. */
export function LiveAnnouncerView({
  announcement,
}: {
  readonly announcement: LiveAnnouncement | null;
}) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {announcement && <span key={announcement.id}>{announcement.text}</span>}
    </div>
  );
}
