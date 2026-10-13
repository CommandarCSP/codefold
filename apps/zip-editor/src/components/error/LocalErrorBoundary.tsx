// apps/zip-editor/src/components/error/LocalErrorBoundary.tsx
import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { reportError } from '@/utils/reportError';
import { RetryErrorFallback } from './RetryErrorFallback';

function LocalFallback({ error, resetErrorBoundary }: FallbackProps) {
  return <RetryErrorFallback error={error} onRetry={resetErrorBoundary} className="m-auto" />;
}

/** 에디터 영역만 폴백으로 바꾼다. 상단 막대는 그대로 쓸 수 있다. */
export function LocalErrorBoundary({ children }: { readonly children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={LocalFallback} onError={reportError}>
      {children}
    </ErrorBoundary>
  );
}
