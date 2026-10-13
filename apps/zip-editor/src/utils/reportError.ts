// apps/zip-editor/src/utils/reportError.ts
/**
 * 에러 경계와 흐름(복원·에디터 실패)의 오류가 모이는 한 곳. 관측 도구가 없어 콘솔에만 남긴다. 붙이려면 여기만 고친다.
 * 화면 층과 비즈니스 층이 함께 쓰므로 가장 아래 층(utils)에 둔다.
 */
export function reportError(
  error: unknown,
  info?: { readonly componentStack?: string | null },
): void {
  console.error(error, info?.componentStack ?? '');
}
