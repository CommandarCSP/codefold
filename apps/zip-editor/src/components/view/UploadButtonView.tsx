// apps/zip-editor/src/components/view/UploadButtonView.tsx
import type { VariantProps } from 'class-variance-authority';
import { Upload } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messages } from '@/utils/messages';

export interface UploadButtonViewProps {
  readonly disabled: boolean;
  readonly onFiles: (files: File[]) => void;
  readonly variant?: VariantProps<typeof buttonVariants>['variant'];
  /** 좁은 화면에서 글자를 감추고 아이콘만 보인다(상단 막대). 글자는 sr-only로 남는다. */
  readonly compact?: boolean;
}

/** 파일 선택창을 여는 버튼. label로 감싸 ref 없이 연다. 같은 파일을 다시 골라도 change가 나도록 값을 비운다. */
export function UploadButtonView({
  disabled,
  onFiles,
  variant = 'outline',
  compact = false,
}: UploadButtonViewProps) {
  return (
    <label
      className={cn(
        buttonVariants({ variant, size: 'sm' }),
        'cursor-pointer has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:pointer-events-none has-disabled:opacity-50',
      )}
    >
      <Upload aria-hidden />
      <span className={compact ? 'max-sm:sr-only' : undefined}>{messages.upload}</span>
      <input
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          onFiles(files);
        }}
      />
    </label>
  );
}
