import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { FileTreePanel } from '../src/tree/file-tree-panel';
import { createEditorWorkspace } from '../src/workspace';
import { fakeArea, memorySource, typeInto } from './helpers';

const setup = async () => {
  const workspace = await createEditorWorkspace({
    source: memorySource([
      ['src/a.ts', 'a'],
      ['src/b.ts', 'b'],
      ['README.md', 'r'],
    ]),
    monaco,
  });
  const fake = fakeArea();
  workspace.attachArea(fake.area);
  render(<FileTreePanel workspace={workspace} />);
  return { workspace, fake, tree: screen.getByRole('tree'), user: userEvent.setup() };
};

const row = (path: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-path]')].find(
    (element) => element.dataset.path === path,
  )!;

describe('새 파일·새 폴더', () => {
  test('선택이 없으면 최상위에 만들고, 새 파일은 탭을 열어 에디터로 포커스를 옮긴다', async () => {
    const { workspace, fake, user } = await setup();
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    const input = screen.getByRole('textbox', { name: '새 파일 이름' });
    expect(input).toHaveFocus();
    await user.type(input, 'new.ts{Enter}');
    expect(workspace.fs.getNode('new.ts')).toBeDefined();
    expect(fake.opened).toEqual(['new.ts']);
    expect(fake.focusCount()).toBe(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('폴더를 고르면 그 안에, 파일을 고르면 그 부모에 만든다', async () => {
    const { workspace, user } = await setup();
    await user.click(row('src'));
    await user.click(screen.getByRole('button', { name: '새 폴더' }));
    await user.type(screen.getByRole('textbox', { name: '새 폴더 이름' }), 'lib{Enter}');
    expect(workspace.fs.getNode('src/lib')?.isDirectory).toBe(true);
    await user.click(row('src/a.ts'));
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    await user.type(screen.getByRole('textbox', { name: '새 파일 이름' }), 'c.ts{Enter}');
    expect(workspace.fs.getNode('src/c.ts')).toBeDefined();
  });
});

describe('이름 검증', () => {
  test('중복 이름은 입력하는 대로 막고, 이유를 입력칸에 연결한다', async () => {
    const { workspace, user } = await setup();
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    const input = screen.getByRole('textbox', { name: '새 파일 이름' });
    await user.type(input, 'readme.md');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const reason = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(reason).toHaveTextContent('같은 이름이 이미 있어요');
    expect(reason).toHaveAttribute('role', 'alert');
    await user.keyboard('{Enter}');
    expect(workspace.fs.children('').map((n) => n.name)).toEqual(['src', 'README.md']);
  });

  test('입력 중인 줄은 다음 줄보다 위에 쌓여, 이유 안내가 다음 줄 글자에 가리지 않는다', async () => {
    const { tree, user } = await setup();
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    const create = screen.getByRole('textbox', { name: '새 파일 이름' });
    await user.type(create, 'readme.md');
    // 줄마다 transform으로 따로 쌓이므로, 안내의 z-index는 줄 요소에 있어야 다음 줄을 넘는다.
    expect(create.closest('[role="treeitem"]')).toHaveClass('cf:z-10');
    const reason = document.getElementById(create.getAttribute('aria-describedby')!);
    expect(reason).toHaveClass('cf:inset-x-0', 'cf:whitespace-normal');
    await user.keyboard('{Escape}');

    await user.click(row('README.md'));
    fireEvent.keyDown(tree, { key: 'F2' });
    const rename = screen.getByRole('textbox', { name: '새 이름' });
    expect(rename.closest('[role="treeitem"]')).toHaveClass('cf:z-10');
  });

  test('빈 이름은 Enter를 누른 뒤에만 알린다', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    const input = screen.getByRole('textbox', { name: '새 파일 이름' });
    expect(input).not.toHaveAttribute('aria-invalid');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('이름을 입력해 주세요');
  });

  test('Esc와 포커스 이탈은 취소하고, Esc는 포커스를 트리로 돌린다', async () => {
    const { tree, user } = await setup();
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(tree).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '새 파일' }));
    await user.click(document.body);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('이름 바꾸기', () => {
  test('F2로 입력칸을 열고 Enter로 바꾼다', async () => {
    const { workspace, tree, user } = await setup();
    await user.click(row('README.md'));
    fireEvent.keyDown(tree, { key: 'F2' });
    const input = screen.getByRole('textbox', { name: '새 이름' });
    expect(input).toHaveValue('README.md');
    await user.clear(input);
    await user.type(input, 'README.txt{Enter}');
    expect(workspace.fs.getNode('README.txt')).toBeDefined();
    expect(tree).toHaveFocus();
  });

  test('오른쪽 클릭 메뉴에서 이름 바꾸기를 고르면 입력칸이 포커스를 가진다', async () => {
    const { user } = await setup();
    fireEvent.contextMenu(row('README.md'));
    await user.click(await screen.findByRole('menuitem', { name: '이름 바꾸기' }));
    expect(screen.getByRole('textbox', { name: '새 이름' })).toHaveFocus();
  });
});

describe('오른쪽 클릭 메뉴', () => {
  test('새 파일·새 폴더·이름 바꾸기·삭제·변경 되돌리기가 있고, 안 고친 파일은 되돌리기를 끈다', async () => {
    await setup();
    fireEvent.contextMenu(row('README.md'));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '새 파일',
      '새 폴더',
      '이름 바꾸기',
      '삭제',
      '변경 되돌리기',
    ]);
    expect(screen.getByRole('menuitem', { name: '변경 되돌리기' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('삭제', () => {
  test('안 고친 파일은 묻지 않고 지운다', async () => {
    const { workspace, user } = await setup();
    fireEvent.contextMenu(row('README.md'));
    await user.click(await screen.findByRole('menuitem', { name: '삭제' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(workspace.fs.getNode('README.md')).toBeUndefined();
  });

  test('고친 파일이 든 폴더는 확인창을 띄우고, 확인해야 지운다', async () => {
    const { workspace, fake, tree, user } = await setup();
    await workspace.loadFile('src/a.ts');
    act(() => typeInto(workspace.registry.get('src/a.ts')!, '!'));
    await user.click(row('src'));
    fireEvent.keyDown(tree, { key: 'Delete' });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('수정한 파일이 함께 지워져요');
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(workspace.fs.getNode('src')).toBeDefined();
    fireEvent.keyDown(tree, { key: 'Delete' });
    await user.click(await screen.findByRole('button', { name: '삭제' }));
    expect(workspace.fs.getNode('src')).toBeUndefined();
    expect(fake.closed).toContain('src/a.ts');
    expect(workspace.store.getState().dirty).toEqual({});
  });
});

describe('변경 되돌리기', () => {
  test('확인하면 원본으로 되돌리고, 취소하면 그대로 둔다', async () => {
    const { workspace, user } = await setup();
    await user.click(row('src'));
    await workspace.loadFile('src/a.ts');
    workspace.registry.acquire('src/a.ts');
    act(() => typeInto(workspace.registry.get('src/a.ts')!, '!'));
    fireEvent.contextMenu(row('src/a.ts'));
    await user.click(await screen.findByRole('menuitem', { name: '변경 되돌리기' }));
    await user.click(await screen.findByRole('button', { name: '취소' }));
    expect(workspace.registry.get('src/a.ts')?.getValue()).toBe('a!');
    fireEvent.contextMenu(row('src/a.ts'));
    await user.click(await screen.findByRole('menuitem', { name: '변경 되돌리기' }));
    await user.click(await screen.findByRole('button', { name: '되돌리기' }));
    // 되돌리기는 원본을 다시 읽으므로 비동기로 끝난다.
    await waitFor(() => expect(workspace.registry.get('src/a.ts')?.getValue()).toBe('a'));
    expect(workspace.registry.isDirty('src/a.ts')).toBe(false);
  });
});

describe('읽기 전용 (ADR-0024)', () => {
  test('편집 잠금을 잃으면 도구 모음과 F2가 동작하지 않는다', async () => {
    const { workspace, tree } = await setup();
    act(() => workspace.store.getState().setReadOnly(true));
    expect(screen.getByRole('button', { name: '새 파일' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '새 폴더' })).toBeDisabled();
    fireEvent.keyDown(tree, { key: 'End' });
    fireEvent.keyDown(tree, { key: 'F2' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('README 검토에서 나온 것', () => {
  test('트리 빈 곳을 오른쪽 클릭하면 앞서 포커스한 항목이 아니라 최상위를 대상으로 한다', async () => {
    const { workspace, tree, user } = await setup();
    fireEvent.contextMenu(row('README.md'));
    await user.keyboard('{Escape}');
    fireEvent.contextMenu(tree);
    expect(workspace.store.getState().focusedPath).toBeUndefined();
    expect(await screen.findByRole('menuitem', { name: '삭제' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('확인창이 떠 있는 사이 편집 잠금을 잃으면 확인을 눌러도 지우지 않는다 (ADR-0024)', async () => {
    const { workspace, user } = await setup();
    await workspace.loadFile('src/a.ts');
    act(() => typeInto(workspace.registry.get('src/a.ts')!, '!'));
    fireEvent.contextMenu(row('src'));
    await user.click(await screen.findByRole('menuitem', { name: '삭제' }));
    await screen.findByRole('alertdialog');
    act(() => workspace.store.getState().setReadOnly(true));
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(workspace.fs.getNode('src/a.ts')).toBeDefined();
  });
});
