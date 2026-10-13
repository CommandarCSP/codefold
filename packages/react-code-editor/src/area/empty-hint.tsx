import { useAreaContext } from './area-context';

/** 탭이 하나도 없을 때의 안내. */
export function EmptyHint() {
  const { messages } = useAreaContext();
  return (
    <div className="cf:flex cf:h-full cf:items-center cf:justify-center cf:bg-background cf:text-sm cf:text-muted-foreground">
      {messages.noOpenTab}
    </div>
  );
}
