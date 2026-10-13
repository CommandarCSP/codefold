// apps/zip-editor/src/components/view/EmptyStateView.tsx
import { FileArchive } from 'lucide-react';
import { messages } from '@/utils/messages';
import { UploadButtonView } from './UploadButtonView';

export interface EmptyStateViewProps {
  readonly canUpload: boolean;
  readonly onFiles: (files: File[]) => void;
}

/** 작업 공간이 없을 때. 놓기 안내와 업로드 버튼만 있다. 샘플 ZIP 기능은 두지 않는다(사용자 결정 ND-3). */
export function EmptyStateView({ canUpload, onFiles }: EmptyStateViewProps) {
  return (
    <section
      aria-labelledby="empty-state-title"
      className="flex flex-1 items-center justify-center p-8"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-10 text-center">
        <FileArchive aria-hidden className="size-10 text-muted-foreground" />
        <h2 id="empty-state-title" className="text-base font-semibold">
          {messages.empty.title}
        </h2>
        <p className="text-sm text-muted-foreground">{messages.empty.description}</p>
        <UploadButtonView disabled={!canUpload} onFiles={onFiles} variant="default" />
      </div>
    </section>
  );
}
