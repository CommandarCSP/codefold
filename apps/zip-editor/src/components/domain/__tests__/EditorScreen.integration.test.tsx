// apps/zip-editor/src/components/domain/__tests__/EditorScreen.integration.test.tsx
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { createFakeServices, zipFile } from '@/test/fakes';
import { renderApp } from '@/test/renderApp';
import { messages } from '@/utils/messages';

/**
 * userEvent.upload()는 파일 입력 클릭을 흉내 내며 "파일 선택창이 뜨는 동안"을 blur→change→focus 순으로
 * 동기 처리한다(실제 브라우저는 그 사이 OS 대화상자가 끼어 있어 change가 훨씬 뒤에 온다). 두 번째 ZIP을 이미
 * 열려 있는 상태에서 고르면 change가 곧장 확인창을 여는데, 이 순서 때문에 확인창이 "열리는 순간의 활성 요소"를
 * body로 잘못 잡는다. 포커스 복귀를 실제로 확인하려면 change를 직접 쏘아 이 테스트 전용 경합을 피한다.
 */
function changeFiles(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('브라우저 지원 안내', () => {
  test('기능이 없으면 앱 대신 지원 안내와 브라우저 목록만 보이고, 잠금·복원을 하지 않는다', async () => {
    const services = createFakeServices();
    renderApp({ services, environment: { kind: 'unsupported', missing: ['web-locks'] } });
    expect(
      await screen.findByRole('heading', { name: messages.unsupported.title }),
    ).toBeInTheDocument();
    for (const browser of messages.unsupported.browsers)
      expect(screen.getByText(browser)).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
    await act(() => Promise.resolve());
    expect(services.shared.lockManager.held).toBe(false);
    expect(services.repository.calls.readSummary).toBe(0);
  });

  test('보안 연결이 아니면 브라우저 안내가 아니라 HTTPS 안내다', async () => {
    const services = createFakeServices();
    renderApp({ services, environment: { kind: 'insecure' } });
    expect(
      await screen.findByRole('heading', { name: messages.insecure.title }),
    ).toBeInTheDocument();
    expect(screen.queryByText(messages.unsupported.title)).toBeNull();
    expect(services.shared.lockManager.held).toBe(false);
  });
});

describe('접근성 (Task 18)', () => {
  test('확인창이 열리면 포커스가 안으로 들어가고, 닫히면 연 요소로 돌아간다', async () => {
    const app = renderApp();
    await screen.findByRole('heading', { name: messages.empty.title });
    const upload = () =>
      within(screen.getByRole('banner')).getByLabelText(messages.upload) as HTMLInputElement;
    await app.user.upload(upload(), zipFile());
    await screen.findByTestId('editor-host');
    act(() => app.controllers[0]?.emit.unexported({ has: true, count: 1 }));
    upload().focus();
    act(() => changeFiles(upload(), zipFile('next.zip')));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await app.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(upload()).toHaveFocus());
  });

  test('상단 막대의 모든 버튼에 접근 가능한 이름이 있다', async () => {
    const app = renderApp();
    await screen.findByRole('heading', { name: messages.empty.title });
    await app.user.upload(
      within(screen.getByRole('banner')).getByLabelText(messages.upload),
      zipFile(),
    );
    await screen.findByTestId('editor-host');
    for (const button of within(screen.getByRole('banner')).getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });
});
