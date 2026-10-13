// apps/zip-editor/src/components/view/DropOverlayView.tsx
import { Upload } from 'lucide-react';
import { messages } from '@/utils/messages';

/** 파일을 끌어 오는 동안 화면 전체를 덮는다. 놓기 이벤트는 창이 받으므로 포인터를 막지 않는다. */
export function DropOverlayView() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary px-12 py-10 text-base font-medium">
        <Upload aria-hidden className="size-8" />
        {messages.dropOverlay}
      </div>
    </div>
  );
}
