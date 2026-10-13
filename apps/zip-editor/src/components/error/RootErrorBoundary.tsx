// apps/zip-editor/src/components/error/RootErrorBoundary.tsx
import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { reportError } from '@/utils/reportError';
import { RootErrorPage } from './RootErrorPage';

export function RootErrorBoundary({ children }: { readonly children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={RootErrorPage} onError={reportError}>
      {children}
    </ErrorBoundary>
  );
}
