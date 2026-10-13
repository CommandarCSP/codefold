import { cn } from './cn';

/** 버튼 모양. shadcn/ui 버튼의 기본값을 cf 접두어로 옮겼다(ADR-0002, ADR-0034). */
export function buttonClass(variant: 'primary' | 'outline' | 'destructive'): string {
  return cn(
    'cf:inline-flex cf:h-8 cf:items-center cf:justify-center cf:rounded-md cf:px-3 cf:text-sm cf:font-medium cf:focus-visible:outline-2 cf:focus-visible:outline-offset-2 cf:focus-visible:outline-ring cf:disabled:pointer-events-none cf:disabled:opacity-50',
    variant === 'primary' && 'cf:bg-primary cf:text-primary-foreground cf:hover:opacity-90',
    variant === 'outline' && 'cf:border cf:border-border cf:bg-background cf:hover:bg-muted',
    variant === 'destructive' && 'cf:bg-destructive cf:text-primary-foreground cf:hover:opacity-90',
  );
}
