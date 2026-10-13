// apps/zip-editor/src/components/view/OpeningStateView.tsx
import { LoaderCircle } from 'lucide-react';
import { messages } from '@/utils/messages';

/** ZIP을 여는 중. */
export function OpeningStateView() {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {messages.opening}
    </div>
  );
}
