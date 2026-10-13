// apps/zip-editor/src/components/view/EditLockNoticeView.tsx
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { messages } from '@/utils/messages';

export interface EditLockNoticeViewProps {
  /** `busy`: 다른 탭이 쥠, `granted`: 넘어왔지만 편집 시작 전. */
  readonly state: 'busy' | 'granted';
  readonly onTakeOver: () => void;
  readonly onStart: () => void;
}

/** 빈 화면(EmptyStateView)과 같은 가운데 카드. 안내가 바뀌면 읽어 주도록 role=status를 둔다. */
export function EditLockNoticeView({ state, onTakeOver, onStart }: EditLockNoticeViewProps) {
  const busy = state === 'busy';
  const Icon = busy ? Lock : LockOpen;
  return (
    <section className="flex flex-1 items-center justify-center p-8">
      <div
        role="status"
        aria-labelledby="edit-lock-title"
        className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center"
      >
        <Icon aria-hidden className="size-10 text-muted-foreground" />
        <h2 id="edit-lock-title" className="text-base font-semibold">
          {busy ? messages.lock.busy : messages.lock.granted}
        </h2>
        <p className="text-sm text-balance text-muted-foreground">
          {busy ? messages.lock.busyDescription : messages.lock.grantedDescription}
        </p>
        <Button className="mt-1" onClick={busy ? onTakeOver : onStart}>
          {busy ? messages.lock.takeOver : messages.lock.start}
        </Button>
      </div>
    </section>
  );
}
