// apps/zip-editor/src/services/browser/persistStorage.ts
/** 브라우저가 저장소를 임의로 지우지 않게 요청한다. 거절돼도 동작을 바꾸지 않는다. */
export async function requestPersistence(
  storage: Pick<StorageManager, 'persist'> | undefined = navigator.storage,
): Promise<boolean> {
  try {
    return (await storage?.persist()) ?? false;
  } catch {
    return false;
  }
}
