import type { Disposable } from '@codefold/virtual-fs';

export interface Emitter<T> {
  emit(value: T): void;
  subscribe(listener: (value: T) => void): Disposable;
  clear(): void;
}

/** 구독자 목록. 한 구독자가 던져도 나머지는 받고, 오류는 마이크로태스크로 따로 던진다. */
export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    emit: (value) => {
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    clear: () => listeners.clear(),
  };
}
