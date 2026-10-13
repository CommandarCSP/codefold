/** 복원 안내의 마지막 수정 시각. `timeZone`은 테스트에서 고정할 때만 넘긴다. */
export function formatDateTime(epochMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(epochMs);
}
