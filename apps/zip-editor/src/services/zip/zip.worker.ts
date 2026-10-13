import type { ZipRequest } from './zipProtocol';
import { createZipWorkerHandler, postHandled } from './zipWorkerHandler';

const handle = createZipWorkerHandler();

self.addEventListener('message', (event: MessageEvent<ZipRequest>) => {
  void handle(event.data).then((handled) =>
    postHandled(handled, (response, transfer) => self.postMessage(response, { transfer })),
  );
});
