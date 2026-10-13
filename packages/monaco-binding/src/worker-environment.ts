import type { MonacoEnvironmentConfig, WorkerFactory } from './types';

/**
 * Monaco worker 설정 객체를 만든다. 전역에 넣지는 않는다. 쓰는 쪽이 `self.MonacoEnvironment`에 넣는다.
 * worker 파일을 만드는 방법은 번들러마다 달라서(Vite `?worker`, webpack 등) 쓰는 쪽이 함수로 넘긴다(ADR-0021).
 */
export function createWorkerEnvironment(createWorker: WorkerFactory): MonacoEnvironmentConfig {
  return { getWorker: (_workerId, label) => createWorker(label) };
}
