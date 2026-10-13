// apps/zip-editor/src/services/browser/saveFile.ts
/** 바로 해제하면 Safari·Firefox에서 내려받기가 시작되지 않을 수 있어 조금 뒤에 해제한다. */
export const REVOKE_DELAY_MS = 10_000;

/** Blob을 그 이름으로 내려받게 한다. 같은 이름이 있으면 브라우저가 번호를 붙인다. */
export function saveFile(blob: Blob, fileName: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
