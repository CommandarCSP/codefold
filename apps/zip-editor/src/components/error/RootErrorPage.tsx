// apps/zip-editor/src/components/error/RootErrorPage.tsx
import { Button } from '@/components/ui/button';
import { messages } from '@/utils/messages';

/** 앱이 더 진행할 수 없을 때의 마지막 폴백. 새로고침하면 마지막 저장본에서 이어 할 수 있다. */
export function RootErrorPage() {
  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-8 text-center"
    >
      <h1 className="text-lg font-semibold text-foreground">{messages.rootError.title}</h1>
      <p className="text-sm text-muted-foreground">{messages.rootError.description}</p>
      <Button onClick={() => window.location.reload()}>{messages.rootError.reload}</Button>
    </div>
  );
}
