// apps/zip-editor/src/components/view/__tests__/views.unit.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { messages } from '@/utils/messages';
import { EditLockNoticeView } from '../EditLockNoticeView';
import { EmptyStateView } from '../EmptyStateView';
import { HeaderBarView, type HeaderBarViewProps } from '../HeaderBarView';
import { OpeningStateView } from '../OpeningStateView';
import { RestoreFailedView } from '../RestoreFailedView';
import { UploadButtonView } from '../UploadButtonView';

const headerProps: HeaderBarViewProps = {
  canUpload: true,
  canDownload: false,
  downloading: false,
  unexportedCount: null,
  showTreeToggle: false,
  treeOpen: false,
  onFiles: () => undefined,
  onDownload: () => undefined,
  onTreeToggle: () => undefined,
};

describe('HeaderBarView', () => {
  test('좁은 화면에서는 버튼 글자와 배지 문구를 감추되, 접근 가능한 이름은 그대로 둔다', () => {
    render(<HeaderBarView {...headerProps} canDownload unexportedCount={2} />);
    // 390px에서 글자를 다 보이면 상단 막대가 넘친다. 글자는 sr-only로 남겨 이름이 바뀌지 않게 한다.
    expect(screen.getByRole('heading', { name: messages.appTitle })).toHaveClass('truncate');
    expect(screen.getByText(messages.upload)).toHaveClass('max-sm:sr-only');
    const download = screen.getByRole('button', { name: new RegExp(messages.download) });
    expect(within(download).getByText(messages.download)).toHaveClass('max-sm:sr-only');
    expect(screen.getByText(messages.unexported(2))).toHaveClass('max-sm:sr-only');
  });

  test('제품 이름·업로드·다운로드가 있고, 다운로드는 props대로 꺼진다', () => {
    render(<HeaderBarView {...headerProps} />);
    expect(screen.getByRole('heading', { name: messages.appTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.upload)).toBeEnabled();
    expect(screen.getByRole('button', { name: messages.download })).toBeDisabled();
  });

  test('만드는 중이면 진행 문구를 보이고 누를 수 없다', () => {
    render(<HeaderBarView {...headerProps} canDownload={false} downloading />);
    const button = screen.getByRole('button', { name: messages.downloading });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  test('받지 않은 변경 수가 있으면 배지를 보인다', () => {
    const { rerender } = render(<HeaderBarView {...headerProps} unexportedCount={3} />);
    expect(screen.getByText(messages.unexported(3))).toBeInTheDocument();
    rerender(<HeaderBarView {...headerProps} unexportedCount={null} />);
    expect(screen.queryByText(/받지 않은 변경/)).toBeNull();
  });

  test('좁은 화면에서만 트리 버튼이 있고, 접근 가능한 이름과 펼침 상태가 있다', async () => {
    const onTreeToggle = vi.fn();
    const { rerender } = render(<HeaderBarView {...headerProps} />);
    expect(screen.queryByRole('button', { name: messages.treeToggle })).toBeNull();
    rerender(
      <HeaderBarView {...headerProps} showTreeToggle treeOpen onTreeToggle={onTreeToggle} />,
    );
    const toggle = screen.getByRole('button', { name: messages.treeToggle });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(onTreeToggle).toHaveBeenCalledTimes(1);
  });
});

describe('UploadButtonView', () => {
  test('고른 파일을 넘기고 값을 비워, 같은 파일을 다시 골라도 또 넘긴다(검토 초점 1)', async () => {
    const onFiles = vi.fn();
    render(<UploadButtonView disabled={false} onFiles={onFiles} />);
    const input = screen.getByLabelText<HTMLInputElement>(messages.upload);
    expect(input).toHaveAttribute('accept', expect.stringContaining('.zip'));
    const file = new File(['PK'], 'a.zip', { type: 'application/zip' });
    await userEvent.upload(input, file);
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledTimes(2);
    expect(onFiles).toHaveBeenLastCalledWith([file]);
  });

  test('꺼져 있으면 입력도 꺼진다', () => {
    render(<UploadButtonView disabled onFiles={() => undefined} />);
    expect(screen.getByLabelText(messages.upload)).toBeDisabled();
  });
});

describe('본문 View', () => {
  test('첫 화면은 안내와 업로드 버튼만 있고 샘플 기능이 없다', () => {
    render(<EmptyStateView canUpload onFiles={() => undefined} />);
    expect(screen.getByRole('heading', { name: messages.empty.title })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.upload)).toBeEnabled();
    expect(screen.queryByText(/샘플/)).toBeNull();
  });

  test('여는 중 표시는 상태 영역이다', () => {
    render(<OpeningStateView />);
    expect(screen.getByRole('status')).toHaveTextContent(messages.opening);
  });

  test('잠금 안내: busy는 여기서 열기, granted는 편집 시작', async () => {
    const onTakeOver = vi.fn();
    const onStart = vi.fn();
    const { rerender } = render(
      <EditLockNoticeView state="busy" onTakeOver={onTakeOver} onStart={onStart} />,
    );
    expect(screen.getByRole('heading', { name: messages.lock.busy })).toBeInTheDocument();
    expect(screen.getByText(messages.lock.busyDescription)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(messages.lock.busy);
    await userEvent.click(screen.getByRole('button', { name: messages.lock.takeOver }));
    expect(onTakeOver).toHaveBeenCalledTimes(1);
    rerender(<EditLockNoticeView state="granted" onTakeOver={onTakeOver} onStart={onStart} />);
    expect(screen.getByRole('heading', { name: messages.lock.granted })).toBeInTheDocument();
    expect(screen.getByText(messages.lock.grantedDescription)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: messages.lock.start }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('복원 실패는 role=alert와 다시 시도·버리기다', async () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(<RestoreFailedView onRetry={onRetry} onDiscard={onDiscard} />);
    expect(screen.getByRole('alert')).toHaveTextContent(messages.restoreFailed.title);
    await userEvent.click(screen.getByRole('button', { name: messages.restoreFailed.retry }));
    await userEvent.click(screen.getByRole('button', { name: messages.restoreFailed.discard }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
