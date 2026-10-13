import { describe, expect, test } from 'vitest';
import { ModelNotFoundError, MonacoBindingError } from '../src/errors';
import { notify } from '../src/notify';
import { createWorkerEnvironment } from '../src/worker-environment';

describe('createWorkerEnvironment (ADR-0021)', () => {
  test('넘긴 함수로 worker를 만들고 언어 이름(label)을 그대로 넘긴다', () => {
    const labels: string[] = [];
    const fake = {} as Worker;
    const environment = createWorkerEnvironment((label) => {
      labels.push(label);
      return fake;
    });
    expect(environment.getWorker?.('worker-id', 'typescript')).toBe(fake);
    expect(labels).toEqual(['typescript']);
  });

  test('전역 MonacoEnvironment를 설정하지 않는다', () => {
    createWorkerEnvironment(() => ({}) as Worker);
    expect('MonacoEnvironment' in globalThis).toBe(false);
  });
});

describe('notify', () => {
  test('한 구독자가 던져도 나머지는 받고, 오류는 마이크로태스크로 따로 던진다', async () => {
    const seen: number[] = [];
    const listeners = new Set<(n: number) => void>([
      () => {
        throw new Error('구독자 버그');
      },
      (n) => seen.push(n),
    ]);
    const thrown = new Promise<unknown>((resolve) => {
      const original = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        globalThis.queueMicrotask = original;
        try {
          callback();
        } catch (error) {
          resolve(error);
        }
      };
    });
    notify(listeners, (listener) => listener(7));
    expect(seen).toEqual([7]);
    expect(await thrown).toBeInstanceOf(Error);
  });
});

describe('오류 class', () => {
  test('ModelNotFoundError는 MonacoBindingError이고 경로를 가진다', () => {
    const error = new ModelNotFoundError('src/a.ts');
    expect(error).toBeInstanceOf(MonacoBindingError);
    expect(error).toMatchObject({ name: 'ModelNotFoundError', path: 'src/a.ts' });
  });
});
