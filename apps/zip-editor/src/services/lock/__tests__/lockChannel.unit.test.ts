import { describe, expect, test } from 'vitest';
import { createLockChannel } from '../lockChannel';
import { createFakeChannelHub } from './fakeChannelHub';

describe('탭 사이 "저장 끝남" 신호 (ADR-0024)', () => {
  test('다른 탭이 보낸 신호를 받는다', async () => {
    const hub = createFakeChannelHub();
    const lost = createLockChannel(hub.open);
    const taker = createLockChannel(hub.open);
    const wait = taker.nextSaveFinished();
    lost.announceSaveFinished();
    await expect(wait.promise).resolves.toBeUndefined();
    expect(hub.listenerCount).toBe(0);
  });

  test('cancel하면 더 듣지 않는다', () => {
    const hub = createFakeChannelHub();
    const wait = createLockChannel(hub.open).nextSaveFinished();
    expect(hub.listenerCount).toBe(1);
    wait.cancel();
    expect(hub.listenerCount).toBe(0);
  });

  test('다른 종류의 메시지는 신호로 보지 않는다', async () => {
    const hub = createFakeChannelHub();
    const taker = createLockChannel(hub.open);
    let finished = false;
    void taker.nextSaveFinished().promise.then(() => {
      finished = true;
    });
    hub.open('codefold-workspace').postMessage({ type: 'hello' });
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
  });
});
