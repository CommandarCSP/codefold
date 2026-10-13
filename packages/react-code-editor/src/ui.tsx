import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 접근 가능한 이름이자 툴팁. */
  readonly label: string;
  readonly children: ReactNode;
}

/** 아이콘만 있는 버튼. `aria-label`과 `title`을 함께 단다. */
export function IconButton({ label, children, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'cf:inline-flex cf:size-7 cf:items-center cf:justify-center cf:rounded-md cf:text-muted-foreground cf:hover:bg-muted cf:hover:text-foreground cf:focus-visible:outline-2 cf:focus-visible:outline-ring cf:disabled:pointer-events-none cf:disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
