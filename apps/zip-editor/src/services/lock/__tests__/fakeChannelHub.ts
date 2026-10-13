import type { ChannelLike } from '../lockChannel';

interface Endpoint {
  readonly name: string;
  readonly listeners: Set<(event: MessageEvent) => void>;
}

/** BroadcastChannel 흉내. 같은 이름의 다른 끝점에만, 다음 마이크로태스크에 보낸다. */
export interface FakeChannelHub {
  open(name: string): ChannelLike;
  readonly listenerCount: number;
}

export function createFakeChannelHub(): FakeChannelHub {
  const endpoints = new Set<Endpoint>();
  return {
    open: (name) => {
      const self: Endpoint = { name, listeners: new Set() };
      endpoints.add(self);
      return {
        postMessage: (message) => {
          for (const other of endpoints) {
            if (other === self || other.name !== name) continue;
            queueMicrotask(() => {
              for (const listener of [...other.listeners])
                listener(new MessageEvent('message', { data: message }));
            });
          }
        },
        addEventListener: (_type, listener) => {
          self.listeners.add(listener);
        },
        removeEventListener: (_type, listener) => {
          self.listeners.delete(listener);
        },
      };
    },
    get listenerCount() {
      let count = 0;
      for (const endpoint of endpoints) count += endpoint.listeners.size;
      return count;
    },
  };
}
