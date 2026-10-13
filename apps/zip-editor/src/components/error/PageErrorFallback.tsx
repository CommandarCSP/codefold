// apps/zip-editor/src/components/error/PageErrorFallback.tsx
import type { FallbackProps } from 'react-error-boundary';
import { RetryErrorFallback } from './RetryErrorFallback';

/** 페이지 경계의 폴백. */
export function PageErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <RetryErrorFallback error={error} onRetry={resetErrorBoundary} />
    </div>
  );
}
