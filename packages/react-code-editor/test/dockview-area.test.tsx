import { act, waitFor } from '@testing-library/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test, vi } from 'vitest';
import { typeInto } from './helpers';
import { renderArea } from './area-harness';

const titles = (area: Awaited<ReturnType<typeof renderArea>>['area']) =>
  area.api.panels.map((panel) => panel.title);
const paths = (area: Awaited<ReturnType<typeof renderArea>>['area']) =>
  area.api.panels.map((panel) => (panel.params as { path: string }).path);

describe('탭 열기', () => {
  test('파일을 열면 탭이 생기고, 이미 열린 파일은 새 탭 없이 활성화한다', async () => {
    const { workspace, area } = await renderArea([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => workspace.openFile('a.py'));
    act(() => workspace.openFile('b.py'));
    act(() => workspace.openFile('a.py'));
    expect(titles(area)).toEqual(['a.py', 'b.py']);
    expect(area.api.activePanel?.title).toBe('a.py');
    expect(workspace.store.getState().activePath).toBe('a.py');
  });

  test('이름이 같은 파일이 둘이면 부모 경로를 붙이고, 하나가 닫히면 뗀다', async () => {
    const { workspace, area } = await renderArea([
      ['src/a/index.ts', 'a'],
      ['src/b/index.ts', 'b'],
    ]);
    act(() => workspace.openFile('src/a/index.ts'));
    act(() => workspace.openFile('src/b/index.ts'));
    expect(titles(area)).toEqual(['index.ts — src/a', 'index.ts — src/b']);
    act(() => area.close('src/b/index.ts'));
    expect(titles(area)).toEqual(['index.ts']);
  });

  test('새 탭은 활성 그룹에 연다', async () => {
    const { workspace, area } = await renderArea([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => workspace.openFile('a.py'));
    act(() => area.splitActive());
    const right = area.api.activeGroup;
    act(() => workspace.openFile('b.py'));
    expect(area.api.getPanel(area.api.activePanel!.id)?.group).toBe(right);
  });
});

describe('탭 수와 model 수명', () => {
  test('안 고친 파일의 탭을 닫으면 model을 지우고, 고친 파일은 남겨 다시 열면 내용과 undo가 이어진다', async () => {
    const { workspace, area } = await renderArea([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    for (const path of ['a.py', 'b.py']) {
      await workspace.loadFile(path);
      act(() => workspace.openFile(path));
      area.acquire(area.api.activePanel!.id, path);
    }
    const dirty = workspace.registry.get('b.py')!;
    act(() => typeInto(dirty, '!'));
    act(() => area.close('a.py'));
    act(() => area.close('b.py'));
    expect(workspace.registry.get('a.py')).toBeUndefined();
    expect(workspace.registry.get('b.py')).toBe(dirty);
    act(() => workspace.openFile('b.py'));
    dirty.undo();
    expect(dirty.getValue()).toBe('b');
  });

  test('같은 파일의 사본 탭이 남아 있으면 model을 지우지 않는다', async () => {
    const { workspace, area } = await renderArea([['a.py', 'a']]);
    await workspace.loadFile('a.py');
    act(() => workspace.openFile('a.py'));
    area.acquire(area.api.activePanel!.id, 'a.py');
    act(() => area.splitActive());
    area.acquire(area.api.activePanel!.id, 'a.py');
    act(() => area.api.activePanel!.api.close());
    expect(workspace.registry.get('a.py')).toBeDefined();
  });

  test('같은 탭에 두 번 acquire해도 한 번만 센다', async () => {
    const { workspace, area } = await renderArea([['a.py', 'a']]);
    await workspace.loadFile('a.py');
    act(() => workspace.openFile('a.py'));
    const id = area.api.activePanel!.id;
    area.acquire(id, 'a.py');
    area.acquire(id, 'a.py');
    act(() => area.close('a.py'));
    expect(workspace.registry.get('a.py')).toBeUndefined();
  });
});

describe('트리 조작 반영', () => {
  test('이름을 바꾸면 탭이 같은 자리에서 새 이름이 되고, 닫으면 새 경로의 탭 수를 내린다', async () => {
    const { workspace, area } = await renderArea([
      ['a.py', 'a'],
      ['c.py', 'c'],
    ]);
    await workspace.loadFile('a.py');
    act(() => workspace.openFile('a.py'));
    area.acquire(area.api.activePanel!.id, 'a.py');
    act(() => workspace.openFile('c.py'));
    act(() => workspace.renameEntry('a.py', 'b.py'));
    expect(paths(area)).toEqual(['b.py', 'c.py']);
    expect(titles(area)).toEqual(['b.py', 'c.py']);
    act(() => area.close('b.py'));
    expect(workspace.registry.get('b.py')).toBeUndefined();
  });

  test('파일을 지우면 모든 그룹에서 그 탭이 닫힌다', async () => {
    const { workspace, area } = await renderArea([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    act(() => area.splitActive());
    act(() => workspace.deleteEntry('a.py'));
    expect(area.api.totalPanels).toBe(0);
  });
});

describe('분할', () => {
  test('오른쪽으로 나누면 같은 파일이 두 그룹에 열린다', async () => {
    const { workspace, area } = await renderArea([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    act(() => area.splitActive());
    expect(area.api.groups).toHaveLength(2);
    expect(paths(area)).toEqual(['a.py', 'a.py']);
  });
});

describe('그룹별 에디터 (ADR-0007)', () => {
  test('그룹마다 에디터 하나를 만들고, 그룹이 사라지면 지운다', async () => {
    const { workspace, area } = await renderArea([['a.py', 'a']]);
    act(() => workspace.openFile('a.py'));
    const groupId = area.api.activeGroup!.id;
    expect(area.editorFor(groupId)).toBe(area.editorFor(groupId));
    expect(monaco.editor.getEditors()).toHaveLength(1);
    act(() => area.close('a.py'));
    expect(monaco.editor.getEditors()).toHaveLength(0);
  });
});

describe('레이아웃 저장·복원', () => {
  test('레이아웃이 바뀌면 JSON으로 알리고, 되살릴 때 지워진 파일의 탭은 뺀다', async () => {
    const first = await renderArea([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    const layouts: unknown[] = [];
    first.area.onLayoutChange((layout) => layouts.push(layout));
    act(() => first.workspace.openFile('a.py'));
    act(() => first.workspace.openFile('b.py'));
    // dockview는 레이아웃 알림을 모아 비동기로 낸다(AsapEvent).
    await waitFor(() => expect(layouts.length).toBeGreaterThan(0));
    const saved = first.area.layout();
    first.view.unmount();
    first.workspace.dispose();

    const second = await renderArea([['a.py', 'a']]);
    act(() => second.area.restoreLayout(saved));
    expect(paths(second.area)).toEqual(['a.py']);
    act(() => second.workspace.createEntry('', 'c.py', false));
    act(() => second.workspace.openFile('c.py'));
    expect(new Set(second.area.api.panels.map((panel) => panel.id)).size).toBe(2);
  });

  test('떠 있는 그룹이 든 옛 저장본은, 떠 있던 탭을 일반 그룹에 연다(ADR-0042)', async () => {
    const first = await renderArea([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => first.workspace.openFile('a.py'));
    act(() => first.workspace.openFile('b.py'));
    // 떠 있는 그룹을 뺀 뒤에도 그 전에 저장한 레이아웃이 브라우저에 남아 있을 수 있다.
    act(() => first.area.api.addFloatingGroup(first.area.api.activePanel!));
    const saved = first.area.layout();
    expect(saved.floatingGroups).toHaveLength(1);
    first.view.unmount();
    first.workspace.dispose();

    const second = await renderArea([
      ['a.py', 'a'],
      ['b.py', 'b'],
    ]);
    act(() => second.area.restoreLayout(saved));
    expect(second.area.api.groups.some((group) => group.api.location.type === 'floating')).toBe(
      false,
    );
    expect(paths(second.area).sort()).toEqual(['a.py', 'b.py']);
    expect(second.area.api.activePanel?.title).toBe('b.py');
  });

  test('깨진 레이아웃은 무시하고 빈 영역으로 시작한다', async () => {
    const { area } = await renderArea([['a.py', 'a']]);
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => area.restoreLayout({ nonsense: true }));
    warn.mockRestore();
    expect(area.api.totalPanels).toBe(0);
  });
});
