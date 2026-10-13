import { describe, expect, test } from 'vitest';
import { formatDateTime } from '../format';

describe('formatDateTime', () => {
  test('한국어 날짜와 오전·오후 시각으로 적는다', () => {
    expect(formatDateTime(Date.UTC(2026, 8, 27, 6, 4), 'Asia/Seoul')).toBe(
      '2026. 9. 27. 오후 3:04',
    );
  });
});
