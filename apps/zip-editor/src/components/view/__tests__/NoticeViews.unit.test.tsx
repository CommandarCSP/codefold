// apps/zip-editor/src/components/view/__tests__/NoticeViews.unit.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { messages } from '@/utils/messages';
import {
  FloatingNoticeView,
  FloatingNoticesView,
  LiveAnnouncerView,
  NoticeAlertView,
  NoticeToastView,
  StorageWarningBannerView,
} from '../NoticeViews';

describe('알림 View', () => {
  test('알림은 넘긴 역할과 문구·덧붙임을 보인다', () => {
    render(
      <NoticeAlertView
        tone="error"
        role="alert"
        message="열 수 없어요"
        detail="다른 파일을 고르세요"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('열 수 없어요');
    expect(screen.getByRole('alert')).toHaveTextContent('다른 파일을 고르세요');
  });

  test('떠 있는 알림 목록은 레이아웃 흐름 밖에 있고, 빈 곳은 누르는 것을 가리지 않는다', () => {
    render(
      <FloatingNoticesView>
        <NoticeToastView message={messages.autosaveHint} />
      </FloatingNoticesView>,
    );
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent(messages.autosaveHint);
    const stack = toast.parentElement!;
    expect(stack).toHaveClass('fixed', 'pointer-events-none');
    expect(toast).toHaveClass('pointer-events-none');
  });

  test('닫을 수 있는 알림은 닫기 버튼과 덧붙인 동작을 누를 수 있다', async () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <FloatingNoticeView
        tone="error"
        role="alert"
        message="받지 못했어요"
        detail="다시 시도해 주세요"
        action={{ label: '다시 시도', onClick: onAction }}
        onDismiss={onDismiss}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('받지 못했어요');
    expect(alert).toHaveTextContent('다시 시도해 주세요');
    expect(alert).toHaveClass('pointer-events-auto');
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await userEvent.click(screen.getByRole('button', { name: messages.dismissNotice }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('저장 불가 배너는 role=alert이고 스펙 문구다', () => {
    render(<StorageWarningBannerView />);
    expect(screen.getByRole('alert')).toHaveTextContent(messages.storageUnavailable);
  });

  test('라이브 영역은 늘 있고, 안내가 오면 그 문구를 담는다', () => {
    const { rerender } = render(<LiveAnnouncerView announcement={null} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
    rerender(<LiveAnnouncerView announcement={{ id: 1, text: '다 받았어요' }} />);
    expect(region).toHaveTextContent('다 받았어요');
  });
});
