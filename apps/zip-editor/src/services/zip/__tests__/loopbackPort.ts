import type { ZipPort } from '../zipClient';
import type { ZipRequest, ZipResponse } from '../zipProtocol';
import { createZipWorkerHandler } from '../zipWorkerHandler';

export interface LoopbackPort extends ZipPort {
  readonly sent: Array<{
    readonly message: ZipRequest;
    readonly transfer: readonly Transferable[];
  }>;
  readonly received: ZipResponse[];
  readonly terminated: boolean;
  crash(error: Error): void;
}

/** Worker 없이 같은 처리기를 부르는 포트. 메시지는 structuredClone으로 복제하고 transfer한 버퍼는 분리한다. */
export function createLoopbackPort(
  options: { readonly hold?: (message: ZipRequest) => boolean } = {},
): LoopbackPort {
  const handle = createZipWorkerHandler();
  const sent: LoopbackPort['sent'] = [];
  const received: ZipResponse[] = [];
  let onMessage: ((response: ZipResponse) => void) | undefined;
  let onCrash: ((error: Error) => void) | undefined;
  let terminated = false;
  return {
    sent,
    received,
    get terminated() {
      return terminated;
    },
    postMessage(message, transfer) {
      sent.push({ message, transfer });
      const arrived = structuredClone(message, { transfer });
      if (options.hold?.(arrived)) return;
      void handle(arrived).then(({ response, transfer: back }) => {
        if (terminated) return;
        const delivered = structuredClone(response, { transfer: back });
        received.push(delivered);
        onMessage?.(delivered);
      });
    },
    onMessage: (listener) => {
      onMessage = listener;
    },
    onCrash: (listener) => {
      onCrash = listener;
    },
    terminate: () => {
      terminated = true;
    },
    crash: (error) => onCrash?.(error),
  };
}
