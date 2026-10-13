import ZipWorker from './zip.worker?worker';
import { ZipWorkerCrashedError, type ZipPort } from './zipClient';
import type { ZipResponse } from './zipProtocol';

/** 작업 공간마다 ZIP Worker 하나(ADR-0028). Vite `?worker`로 번들한다. */
export function createZipWorker(): ZipPort {
  const worker = new ZipWorker({ name: 'codefold-zip' });
  return {
    postMessage: (message, transfer) => worker.postMessage(message, transfer),
    onMessage: (listener) =>
      worker.addEventListener('message', (event: MessageEvent<ZipResponse>) =>
        listener(event.data),
      ),
    onCrash: (listener) => {
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        listener(new ZipWorkerCrashedError(event.message || 'ZIP Worker가 멈췄습니다'));
      });
      worker.addEventListener('messageerror', () =>
        listener(new ZipWorkerCrashedError('ZIP Worker 메시지를 읽지 못했습니다')),
      );
    },
    terminate: () => worker.terminate(),
  };
}
