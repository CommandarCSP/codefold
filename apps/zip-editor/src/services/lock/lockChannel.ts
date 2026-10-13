export const LOCK_CHANNEL_NAME = 'codefold-workspace';

/** BroadcastChannel에서 이 앱이 쓰는 모양. 테스트는 가짜 허브를 넘긴다. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface SaveFinishedWait {
  readonly promise: Promise<void>;
  cancel(): void;
}

/** 잠금을 잃은 탭이 진행 중 저장을 마쳤다고 알리는 신호(ADR-0024). 보낸 탭 자신은 받지 않는다. */
export interface LockChannel {
  announceSaveFinished(): void;
  /** 지금부터 오는 신호를 기다린다. steal 전에 불러 두어야 곧바로 오는 신호도 받는다. */
  nextSaveFinished(): SaveFinishedWait;
}

const isSaveFinished = (data: unknown) =>
  typeof data === 'object' && data !== null && 'type' in data && data.type === 'save-finished';

export function createLockChannel(
  open: (name: string) => ChannelLike = (name) => new BroadcastChannel(name),
): LockChannel {
  let channel: ChannelLike | undefined;
  const get = () => (channel ??= open(LOCK_CHANNEL_NAME));
  return {
    announceSaveFinished: () => get().postMessage({ type: 'save-finished' }),
    nextSaveFinished: () => {
      const target = get();
      let listener: ((event: MessageEvent) => void) | undefined;
      const stop = () => {
        if (listener) target.removeEventListener('message', listener);
        listener = undefined;
      };
      const promise = new Promise<void>((resolve) => {
        listener = (event) => {
          if (!isSaveFinished(event.data)) return;
          stop();
          resolve();
        };
        target.addEventListener('message', listener);
      });
      return { promise, cancel: stop };
    },
  };
}
