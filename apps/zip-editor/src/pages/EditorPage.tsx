// apps/zip-editor/src/pages/EditorPage.tsx
import { ErrorBoundary } from 'react-error-boundary';
import { EditorScreen } from '@/components/domain/editor/EditorScreen';
import { PageErrorFallback } from '@/components/error/PageErrorFallback';
import { reportError } from '@/utils/reportError';

/** 라우트 `/` 한 장(라우터 없음). */
export function EditorPage() {
  return (
    <ErrorBoundary FallbackComponent={PageErrorFallback} onError={reportError}>
      <EditorScreen />
    </ErrorBoundary>
  );
}
