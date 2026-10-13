// apps/zip-editor/src/components/view/RestoreFailedView.tsx
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { messages } from '@/utils/messages';

export interface RestoreFailedViewProps {
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}

/** 저장본을 되살리지 못함. 저장본은 "버리기"를 눌러야만 지운다. */
export function RestoreFailedView({ onRetry, onDiscard }: RestoreFailedViewProps) {
  return (
    <section className="flex flex-1 items-center justify-center p-8">
      <Alert variant="destructive" className="max-w-md">
        <TriangleAlert aria-hidden />
        <AlertTitle>{messages.restoreFailed.title}</AlertTitle>
        <AlertDescription>
          <p>{messages.restoreFailed.description}</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={onRetry}>{messages.restoreFailed.retry}</Button>
            <Button variant="outline" onClick={onDiscard}>
              {messages.restoreFailed.discard}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </section>
  );
}
