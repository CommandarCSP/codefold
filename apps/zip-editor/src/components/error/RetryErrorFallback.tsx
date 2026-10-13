// apps/zip-editor/src/components/error/RetryErrorFallback.tsx
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { messages } from '@/utils/messages';

export interface RetryErrorFallbackProps {
  /** 잡은 오류. 서버가 없는 앱이라 종류를 나누지 않고 같은 문구를 보인다. */
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly className?: string;
}

/** 에러 키트의 표준 재시도 폴백. */
export function RetryErrorFallback({ onRetry, className }: RetryErrorFallbackProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-muted/30 p-6 text-center',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{messages.errorKit.runtime}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {messages.errorKit.retry}
      </Button>
    </div>
  );
}
