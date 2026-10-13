import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 이 패키지의 클래스는 접두어 cf를 쓴다(ADR-0034). tailwind-merge도 같은 접두어로 충돌을 가린다(ADR-0020).
const merge = extendTailwindMerge({ prefix: 'cf' });

/** 클래스를 합친다. 같은 속성의 cf 클래스가 겹치면 뒤의 것이 이긴다. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
