/**
 * 로컬 시각을 ZIP의 DOS 날짜·시간으로 바꾼다. 초는 2초 단위다.
 * DOS 날짜는 1980~2107년만 담는다. 1980년 이전은 1980-01-01로, 2107년 뒤는 2107-12-31 23:59:58로 맞춘다.
 */
export function toDosDateTime(date: Date): { time: number; date: number } {
  if (date.getFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  if (date.getFullYear() > 2107) return toDosDateTime(new Date(2107, 11, 31, 23, 59, 58));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}
