import { describe, expect, test } from 'vitest';
import { cn } from '../src/cn';
import {
  defaultMessages,
  formatMessage,
  nameProblemMessage,
  resolveMessages,
} from '../src/messages';

describe('문구 (ADR-0015)', () => {
  test('문구를 주지 않으면 한국어 기본 문구다', () => {
    expect(resolveMessages()).toEqual(defaultMessages);
    expect(defaultMessages.newFile).toBe('새 파일');
  });

  test('일부만 주면 그 문구만 바뀐다', () => {
    const messages = resolveMessages({ newFile: 'New file' });
    expect(messages.newFile).toBe('New file');
    expect(messages.newFolder).toBe(defaultMessages.newFolder);
  });

  test('undefined로 준 문구는 기본값을 지우지 않는다', () => {
    expect(resolveMessages({ newFile: undefined }).newFile).toBe('새 파일');
  });

  test('자리 표시자를 채운다', () => {
    expect(formatMessage('{name}을 지울까요?', { name: 'src' })).toBe('src을 지울까요?');
    expect(formatMessage('{missing}', {})).toBe('{missing}');
  });

  test('이름 검증 이유마다 문구가 있다', () => {
    for (const problem of ['empty', 'reserved', 'invalid-character', 'duplicate'] as const) {
      expect(nameProblemMessage(defaultMessages, problem)).not.toBe('');
    }
  });
});

describe('cn', () => {
  test('cf 접두어 클래스끼리 충돌하면 뒤의 것이 이긴다', () => {
    expect(cn('cf:p-2', 'cf:p-4')).toBe('cf:p-4');
    expect(cn('cf:flex', false, 'cf:gap-1')).toBe('cf:flex cf:gap-1');
  });
});
