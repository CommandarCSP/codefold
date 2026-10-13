import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test, vi } from 'vitest';
import { defaultMessages } from '../src/messages';
import { FileTree } from '../src/tree/file-tree';
import { createEditorWorkspace } from '../src/workspace';
import { fakeArea, memorySource, typeInto } from './helpers';

type Items = Parameters<typeof memorySource>[0];

const renderTree = async (items: Items) => {
  const workspace = await createEditorWorkspace({ source: memorySource(items), monaco });
  const fake = fakeArea();
  workspace.attachArea(fake.area);
  const onRequestRename = vi.fn();
  const onRequestDelete = vi.fn();
  render(
    <FileTree
      workspace={workspace}
      messages={defaultMessages}
      onRequestRename={onRequestRename}
      onRequestDelete={onRequestDelete}
    />,
  );
  return { workspace, fake, onRequestRename, onRequestDelete, tree: screen.getByRole('tree') };
};

const rowNames = () =>
  screen.queryAllByRole('treeitem').map((row) => row.getAttribute('data-path'));
const row = (path: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-path]')].find(
    (element) => element.dataset.path === path,
  ) ?? null;
const activeRow = (tree: HTMLElement) => {
  const id = tree.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};
const project: Items = [
  ['src/a.ts', 'a'],
  ['src/b.ts', 'b'],
  ['src/lib/c.ts', 'c'],
  ['README.md', 'r'],
];
const many = (count: number): Items =>
  Array.from({ length: count }, (_, i) => [`f-${i}.txt`, ''] as const);

describe('트리 표시', () => {
  test('처음에는 최상위 항목만 보이고, 행마다 트리 속성이 있다', async () => {
    const { tree } = await renderTree(project);
    expect(tree).toHaveAttribute('aria-label', '파일 트리');
    expect(rowNames()).toEqual(['src', 'README.md']);
    const src = row('src')!;
    expect(src).toHaveAttribute('aria-level', '1');
    expect(src).toHaveAttribute('aria-setsize', '2');
    expect(src).toHaveAttribute('aria-posinset', '1');
    expect(src).toHaveAttribute('aria-expanded', 'false');
    expect(row('README.md')).not.toHaveAttribute('aria-expanded');
  });

  test('부가 파일은 트리에 보이지 않는다', async () => {
    await renderTree([
      ['__MACOSX/._a', 'x'],
      ['.DS_Store', 'x'],
      ['a.ts', 'a'],
    ]);
    expect(rowNames()).toEqual(['a.ts']);
  });

  test('항목을 끌어서 옮길 수 없다', async () => {
    await renderTree(project);
    for (const item of screen.getAllByRole('treeitem'))
      expect(item).not.toHaveAttribute('draggable');
  });
});

describe('마우스', () => {
  test('폴더를 누르면 펼치고, 다시 누르면 접는다', async () => {
    await renderTree(project);
    await userEvent.click(row('src')!);
    expect(rowNames()).toEqual(['src', 'src/lib', 'src/a.ts', 'src/b.ts', 'README.md']);
    expect(row('src')).toHaveAttribute('aria-expanded', 'true');
    expect(row('src/lib')).toHaveAttribute('aria-level', '2');
    await userEvent.click(row('src')!);
    expect(rowNames()).toEqual(['src', 'README.md']);
  });

  test('파일을 누르면 탭을 연다', async () => {
    const { fake } = await renderTree(project);
    await userEvent.click(row('README.md')!);
    expect(fake.opened).toEqual(['README.md']);
  });
});

describe('가상화', () => {
  test('1만 개 항목에서도 DOM 행은 보이는 행과 여유분뿐이다', async () => {
    const { tree } = await renderTree(many(10_000));
    expect(screen.getAllByRole('treeitem').length).toBeLessThanOrEqual(40);
    expect(row('f-0.txt')).not.toBeNull();
    act(() => {
      tree.scrollTop = 24 * 5000;
      fireEvent.scroll(tree);
    });
    await waitFor(() => expect(row('f-5000.txt')).not.toBeNull());
    expect(row('f-0.txt')).toBeNull();
    expect(screen.getAllByRole('treeitem').length).toBeLessThanOrEqual(40);
  });
});

describe('키보드 (ADR-0029)', () => {
  test('화살표·Home·End·Enter로 움직이고, 포커스는 트리 컨테이너에 있다', async () => {
    const { tree, fake } = await renderTree(project);
    tree.focus();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(activeRow(tree)).toHaveAttribute('data-path', 'src');
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(row('src')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(activeRow(tree)).toHaveAttribute('data-path', 'src/lib');
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(activeRow(tree)).toHaveAttribute('data-path', 'src/a.ts');
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(fake.opened).toEqual(['src/a.ts']);
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(activeRow(tree)).toHaveAttribute('data-path', 'src');
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(row('src')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(tree, { key: 'End' });
    expect(activeRow(tree)).toHaveAttribute('data-path', 'README.md');
    fireEvent.keyDown(tree, { key: 'Home' });
    expect(activeRow(tree)).toHaveAttribute('data-path', 'src');
    expect(document.activeElement).toBe(tree);
  });

  test('화면 밖 행으로 옮기면 먼저 스크롤하고, 행이 그려진 뒤 그 행을 가리킨다', async () => {
    const { tree } = await renderTree(many(10_000));
    tree.focus();
    fireEvent.keyDown(tree, { key: 'End' });
    await waitFor(() => expect(activeRow(tree)).toHaveAttribute('data-path', 'f-9999.txt'));
    expect(screen.getAllByRole('treeitem').length).toBeLessThanOrEqual(40);
  });

  test('휠로 활성 행을 화면 밖으로 밀어도 포커스는 트리에 남는다', async () => {
    const { tree } = await renderTree(many(10_000));
    tree.focus();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    act(() => {
      tree.scrollTop = 24 * 8000;
      fireEvent.scroll(tree);
    });
    await waitFor(() => expect(row('f-8000.txt')).not.toBeNull());
    expect(document.activeElement).toBe(tree);
  });

  test('F2는 이름 바꾸기, Delete는 삭제를 요청한다', async () => {
    const { tree, onRequestRename, onRequestDelete, workspace } = await renderTree(project);
    tree.focus();
    fireEvent.keyDown(tree, { key: 'End' });
    fireEvent.keyDown(tree, { key: 'F2' });
    fireEvent.keyDown(tree, { key: 'Delete' });
    expect(onRequestRename).toHaveBeenCalledWith('README.md');
    expect(onRequestDelete).toHaveBeenCalledWith('README.md');
    act(() => workspace.store.getState().setReadOnly(true));
    fireEvent.keyDown(tree, { key: 'F2' });
    expect(onRequestRename).toHaveBeenCalledTimes(1);
  });
});

describe('수정 표시', () => {
  test('파일을 고치면 그 행과 부모 폴더에 표시가 붙고, undo로 돌아가면 사라진다', async () => {
    const { workspace } = await renderTree(project);
    await userEvent.click(row('src')!);
    await workspace.loadFile('src/a.ts');
    const model = workspace.registry.get('src/a.ts')!;
    act(() => typeInto(model, '!'));
    expect(within(row('src/a.ts')!).getByText('수정됨')).toBeInTheDocument();
    expect(within(row('src')!).getByText('안에 수정된 파일 있음')).toBeInTheDocument();
    expect(within(row('src/b.ts')!).queryByText('수정됨')).toBeNull();
    act(() => model.undo());
    expect(within(row('src/a.ts')!).queryByText('수정됨')).toBeNull();
    expect(within(row('src')!).queryByText('안에 수정된 파일 있음')).toBeNull();
  });
});

describe('활성 탭 따라가기', () => {
  test('활성 탭이 바뀌면 부모를 펼치고 그 행까지 스크롤하며, 트리로 포커스를 옮기지 않는다', async () => {
    // 폴더가 파일보다 먼저 오므로, 앞에 폴더 2000개를 두어 z가 화면 밖에 있게 한다.
    const items: Items = [
      ...Array.from({ length: 2000 }, (_, i) => [`a-${i}/x.txt`, ''] as const),
      ['z/deep/y.ts', 'y'],
    ];
    const { fake, tree } = await renderTree(items);
    act(() => fake.emitActive('z/deep/y.ts'));
    await waitFor(() => expect(row('z/deep/y.ts')).not.toBeNull());
    expect(row('z/deep/y.ts')).toHaveAttribute('aria-selected', 'true');
    // 라이트 테마에서도 보이도록, 선택된 줄은 흐린 hover 색(muted)과 다른 강조 색을 쓴다.
    expect(row('z/deep/y.ts')).toHaveClass('cf:bg-selected');
    expect(row('z')).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).not.toBe(tree);
  });
});

describe('구조 변경 반영', () => {
  test('추가·이름 변경·삭제가 바로 트리에 보인다', async () => {
    const { workspace } = await renderTree(project);
    act(() => void workspace.createEntry('', 'new.ts', false));
    expect(rowNames()).toContain('new.ts');
    act(() => workspace.renameEntry('new.ts', 'renamed.ts'));
    expect(rowNames()).toContain('renamed.ts');
    act(() => workspace.deleteEntry('renamed.ts'));
    expect(rowNames()).not.toContain('renamed.ts');
  });
});

describe('빈 폴더에서 →', () => {
  test('펼친 빈 폴더에서 →를 눌러도 포커스가 옮겨 가지 않는다', async () => {
    const { workspace, tree } = await renderTree([['a.txt', 'a']]);
    act(() => workspace.createEntry('', 'empty', true));
    act(() => workspace.store.getState().setFocused('empty'));
    act(() => workspace.store.getState().expand('empty'));
    tree.focus();
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(workspace.store.getState().focusedPath).toBe('empty');
  });
});

describe('파일 아이콘 (ADR-0010)', () => {
  test('확장자로 짐작한 종류에 따라 텍스트·이미지·바이너리 아이콘을 다르게 보인다', async () => {
    await renderTree([
      ['a.ts', 'a'],
      ['logo.png', 'x'],
      ['data.zip', 'x'],
    ]);
    const icon = (path: string) =>
      row(path)?.querySelector('svg.lucide:not(.lucide-chevron-right)')?.getAttribute('class');
    expect(icon('a.ts')).toContain('lucide-file-text');
    expect(icon('logo.png')).toContain('lucide-file-image');
    expect(icon('data.zip')).toContain('lucide-file-archive');
  });
});
