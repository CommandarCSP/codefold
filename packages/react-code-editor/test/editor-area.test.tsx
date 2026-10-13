import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { EditorArea } from '../src/area/editor-area';
import type { DockviewArea } from '../src/area/dockview-area';
import { defaultMessages } from '../src/messages';
import { createEditorWorkspace } from '../src/workspace';
import { memorySource, typeInto } from './helpers';

const setup = async (items: Parameters<typeof memorySource>[0]) => {
  const workspace = await createEditorWorkspace({ source: memorySource(items), monaco });
  let area: DockviewArea | undefined;
  render(
    <div style={{ height: 400, width: 800 }}>
      <EditorArea
        workspace={workspace}
        monaco={monaco}
        messages={defaultMessages}
        onReady={(created) => (area = created)}
      />
    </div>,
  );
  await waitFor(() => expect(area).toBeDefined());
  return { workspace, area: area! };
};

const tab = (name: string) =>
  screen.getAllByRole('button', { name: `${name} 닫기` })[0]!.closest('.dv-tab') as HTMLElement;

describe('dockview 테마', () => {
  test('dockview 기본 테마(abyss) 대신 에디터 색 변수를 쓰는 테마를 붙인다', async () => {
    await setup([['a.py', 'a']]);
    const shell = document.querySelector('.dv-shell');
    expect(shell).toHaveClass('cf-dockview');
    expect(shell).not.toHaveClass('dockview-theme-abyss');
  });

  test('파일을 읽는 동안의 안내는 배경을 칠하고, 늦어질 때만 보인다', async () => {
    const { workspace } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    const loading = screen.getByText(defaultMessages.fileLoading);
    expect(loading).toHaveClass('cf:bg-background', 'cf-delayed-reveal');
  });
});

describe('탭 모양과 좁은 영역 (UI 점검)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('탭 닫기 버튼은 24px이고, 탭 여백은 탭 컴포넌트 한 곳에서만 준다', async () => {
    const { workspace } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(tab('a.py')).toBeDefined());
    expect(screen.getByRole('button', { name: 'a.py 닫기' })).toHaveClass('cf:size-6');
    expect(tab('a.py').firstElementChild?.firstElementChild).toHaveClass('cf:pl-3', 'cf:pr-1.5');
  });

  test('탭이 활성이 되면 탭 줄에서 그 탭이 보이게 스크롤한다', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { workspace } = await setup([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => workspace.openFile('a.py'));
    act(() => workspace.openFile('b.py'));
    scroll.mockClear();
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts.at(-1)).toBe(tab('a.py').firstElementChild?.firstElementChild);
  });

  test('나누기 버튼은 좁은 영역에서 감출 수 있게 표시가 붙는다', async () => {
    const { workspace } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    expect(await screen.findByRole('button', { name: '오른쪽으로 나누기' })).toHaveClass(
      'cf-split-action',
    );
  });

  test('에디터가 좁으면 미니맵을 끄고, 넓어지면 다시 켠다', async () => {
    // 관찰 대상과 함께 기억해 두었다가, 실제 브라우저처럼 대상(target)을 담아 크기 변화를 알린다.
    const observed: { callback: ResizeObserverCallback; target: Element }[] = [];
    vi.spyOn(window, 'ResizeObserver').mockImplementation(function (callback) {
      return {
        observe: (target: Element) => observed.push({ callback, target }),
        unobserve() {},
        disconnect() {},
      } as ResizeObserver;
    });
    const { workspace } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    const editor = monaco.editor.getEditors()[0]!;
    const minimap = () => editor.getOption(monaco.editor.EditorOption.minimap).enabled;
    const resize = (width: number) =>
      act(() => {
        for (const { callback, target } of observed)
          callback(
            [{ target, contentRect: { width } } as ResizeObserverEntry],
            {} as ResizeObserver,
          );
      });
    resize(390);
    expect(minimap()).toBe(false);
    resize(1000);
    expect(minimap()).toBe(true);
  });
});

describe('탭 줄', () => {
  test('탭이 없으면 파일을 고르라는 안내를 보인다', async () => {
    await setup([['a.py', 'a']]);
    expect(screen.getByText('파일 트리에서 파일을 고르세요')).toBeInTheDocument();
  });

  test('탭에 이름·수정 표시·닫기 버튼이 있고, 닫기 버튼으로 닫는다', async () => {
    const { workspace } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(workspace.registry.get('a.py')).toBeDefined());
    expect(within(tab('a.py')).getByText('a.py')).toBeInTheDocument();
    act(() => typeInto(workspace.registry.get('a.py')!, '!'));
    expect(within(tab('a.py')).getByText('수정됨')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'a.py 닫기' }));
    expect(screen.queryByRole('button', { name: 'a.py 닫기' })).toBeNull();
    expect(workspace.registry.get('a.py')).toBeDefined();
  });

  test('열린 탭의 파일 이름을 바꾸면 탭 제목이 바뀌고 수정 표시가 이어진다', async () => {
    const { workspace } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(workspace.registry.get('a.py')).toBeDefined());
    act(() => typeInto(workspace.registry.get('a.py')!, '!'));
    act(() => workspace.renameEntry('a.py', 'b.py'));
    await waitFor(() => expect(within(tab('b.py')).getByText('b.py')).toBeInTheDocument());
    expect(within(tab('b.py')).getByText('수정됨')).toBeInTheDocument();
  });
});

describe('그룹 머리 버튼', () => {
  test('오른쪽으로 나누면 두 에디터가 model 하나를 함께 쓴다', async () => {
    const { workspace, area } = await setup([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '오른쪽으로 나누기' }));
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(2));
    const [left, right] = monaco.editor.getEditors();
    expect(left?.getModel()).toBe(right?.getModel());
    expect(area.api.groups).toHaveLength(2);
  });

  test('떠 있는 그룹은 만들지 않는다: 띄우기 버튼이 없고, Shift+클릭으로도 띄우지 않는다(ADR-0042)', async () => {
    const { workspace, area } = await setup([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => workspace.openFile('a.py'));
    act(() => workspace.openFile('b.py'));
    expect(screen.queryByRole('button', { name: '창으로 띄우기' })).toBeNull();
    // dockview는 Shift를 누른 채 탭을 누르면 그 탭을 떠 있는 그룹으로 띄운다.
    fireEvent.pointerDown(tab('a.py'), { shiftKey: true });
    expect(area.api.groups.some((group) => group.api.location.type === 'floating')).toBe(false);
  });
});

describe('레이아웃 되살리기', () => {
  test('저장한 레이아웃으로 시작한다', async () => {
    const first = await setup([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => first.workspace.openFile('a.py'));
    act(() => first.workspace.openFile('b.py'));
    const saved = first.area.layout();
    document.body.replaceChildren();
    first.workspace.dispose();
    const workspace = await createEditorWorkspace({
      source: memorySource([
        ['a.py', 'a'],
        ['b.py', 'b'],
      ]),
      monaco,
    });
    let area: DockviewArea | undefined;
    render(
      <div style={{ height: 400, width: 800 }}>
        <EditorArea
          workspace={workspace}
          monaco={monaco}
          messages={defaultMessages}
          initialLayout={saved}
          onReady={(created) => (area = created)}
        />
      </div>,
    );
    await waitFor(() => expect(area?.api.totalPanels).toBe(2));
  });
});
