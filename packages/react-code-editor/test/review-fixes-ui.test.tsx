import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { FileTreePanel } from '../src/tree/file-tree-panel';
import { createEditorWorkspace } from '../src/workspace';
import { fakeArea, memorySource } from './helpers';

const setup = async (items: Parameters<typeof memorySource>[0]) => {
  const workspace = await createEditorWorkspace({ source: memorySource(items), monaco });
  workspace.attachArea(fakeArea().area);
  render(
    <>
      <FileTreePanel workspace={workspace} />
      <input aria-label="다른 입력칸" />
    </>,
  );
  return { workspace, tree: screen.getByRole('tree'), user: userEvent.setup() };
};

describe('이름 입력칸의 포커스 이탈', () => {
  test('다른 곳을 누르면 취소하고, 포커스를 트리로 빼앗지 않는다', async () => {
    const { user } = await setup([['a.ts', 'a']]);
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    const other = screen.getByRole('textbox', { name: '다른 입력칸' });
    await user.click(other);
    expect(screen.queryByRole('textbox', { name: '새 파일 이름' })).toBeNull();
    expect(other).toHaveFocus();
  });
});

describe('새 항목 입력칸이 화면 밖에 있을 때', () => {
  test('입력 행까지 스크롤해 입력칸이 보인다', async () => {
    const items = Array.from({ length: 300 }, (_, i) => [`src/f-${i}.txt`, ''] as const);
    const { workspace, user } = await setup(items);
    act(() => {
      workspace.store.getState().expand('src');
      workspace.store.getState().setFocused('src/f-250.txt');
    });
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '새 파일 이름' })).toBeInTheDocument(),
    );
  });
});

describe('새 항목 입력 행의 접근성', () => {
  test('입력 행도 트리 항목이다', async () => {
    const { user } = await setup([['a.ts', 'a']]);
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    const input = screen.getByRole('textbox', { name: '새 파일 이름' });
    expect(input.closest('[role="treeitem"]')).not.toBeNull();
  });
});
