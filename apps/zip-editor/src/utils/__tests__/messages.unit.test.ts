import { describe, expect, test } from 'vitest';
import { messages } from '../messages';

describe('문구 모듈 (ADR-0015)', () => {
  test('변수가 들어가는 문구는 함수다', () => {
    expect(messages.unexported(3)).toBe('받지 않은 변경 3개');
    expect(messages.discardSaved('project.zip')).toBe(
      '이전 작업(project.zip)의 변경 내용을 버리고 새 ZIP을 열까요?',
    );
    expect(messages.restore.detail('project.zip', Date.UTC(2026, 8, 27, 6, 4), 'Asia/Seoul')).toBe(
      'project.zip · 마지막 수정 2026. 9. 27. 오후 3:04',
    );
  });

  test('스펙이 정한 문구를 그대로 쓴다', () => {
    expect(messages.largeZip).toBe('메모리가 부족하면 다운로드가 실패할 수 있어요');
    expect(messages.autosaveHint).toBe('변경 내용은 자동으로 저장됩니다');
    expect(messages.storageUnavailable).toBe(
      '이 브라우저에 저장할 수 없어 새로고침하면 작업을 잃습니다',
    );
    expect(messages.restore.title).toBe('이전 작업을 이어서 할까요?');
    expect(messages.lock).toEqual({
      busy: '다른 탭에서 작업 중이에요',
      busyDescription:
        '편집은 한 번에 브라우저 탭 하나에서만 할 수 있어요. 여기서 열면 다른 탭은 읽기 전용이 돼요.',
      takeOver: '여기서 열기',
      granted: '이제 이 탭에서 편집할 수 있어요',
      grantedDescription: '편집하던 탭이 닫혀서 편집 권한이 이 탭으로 넘어왔어요.',
      start: '편집 시작',
    });
    expect(messages.insecure.title).toBe('HTTPS 주소로 열어 주세요');
    expect(messages.unsupported.title).toBe('이 브라우저는 지원하지 않아요');
    expect(messages.unsupported.browsers).toEqual(['Chrome', 'Edge', 'Firefox', 'Safari']);
  });
});
