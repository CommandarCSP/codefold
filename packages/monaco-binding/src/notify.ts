/** 구독자에게 알린다. 한 구독자가 던져도 나머지는 받고, 오류는 마이크로태스크로 따로 던져 드러낸다. */
export function notify<L>(listeners: ReadonlySet<L>, call: (listener: L) => void): void {
  for (const listener of [...listeners]) {
    try {
      call(listener);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}
