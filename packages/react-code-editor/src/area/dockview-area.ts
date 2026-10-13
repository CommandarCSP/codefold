import {
  createEditorGroup,
  type EditorGroup,
  type EditorOptions,
  type MonacoApi,
} from '@codefold/monaco-binding';
import type { Disposable } from '@codefold/virtual-fs';
import type { DockviewApi, IDockviewPanel, SerializedDockview } from 'dockview-react';
import { createEmitter } from '../emitter';
import { EDITOR_OPTIONS } from '../monaco/editor-options';
import { nameOf, parentOf } from '../paths';
import type { EditorAreaPort } from '../types';
import type { EditorWorkspace } from '../workspace';

/** 파일 패널의 dockview 컴포넌트 이름. */
export const FILE_PANEL = 'file';

/** 파일 패널의 params. 패널 id는 바뀌지 않지만 경로는 이름 변경으로 바뀐다. */
export interface FilePanelParams {
  readonly path: string;
}

/** 그룹 하나의 에디터와, 탭 자리로 옮겨 붙이는 호스트 요소. */
export interface GroupEditor {
  readonly group: EditorGroup;
  readonly host: HTMLDivElement;
}

/** dockview 탭·그룹을 감싼 에디터 영역(ADR-0007). */
export interface DockviewArea extends EditorAreaPort, Disposable {
  readonly api: DockviewApi;
  /** 그룹의 에디터. 처음 부를 때 만든다. 그룹 안에서 탭을 바꿔도 같은 에디터다. */
  editorFor(groupId: string): GroupEditor;
  /** `focusEditor(path)`로 미뤄 둔 포커스 요청이 그 파일 것이면 지우고 `true`를 돌려준다. 텍스트 탭이 에디터를 붙인 뒤 부른다. */
  takeFocusRequest(path: string): boolean;
  /** 텍스트 탭이 model을 쓰기 시작했다. 탭마다 한 번만 등록부 탭 수를 올린다. */
  acquire(panelId: string, path: string): void;
  /** 활성 탭을 오른쪽 새 그룹에 하나 더 연다. */
  splitActive(): void;
  /** 지금의 배치(dockview JSON). */
  layout(): SerializedDockview;
  /**
   * 저장한 배치를 되살린다. 지워진 파일의 탭은 뺀다. 깨진 JSON이면 빈 영역으로 둔다.
   * 떠 있는 그룹은 두지 않으므로(ADR-0042), 옛 저장본의 떠 있던 탭은 일반 그룹에 연다.
   */
  restoreLayout(layout: unknown): void;
  /** 배치가 바뀔 때마다 부른다. 저장은 쓰는 쪽이 묶어서 한다. */
  onLayoutChange(listener: (layout: SerializedDockview) => void): Disposable;
}

export interface CreateDockviewAreaOptions {
  readonly api: DockviewApi;
  readonly workspace: EditorWorkspace;
  readonly monaco: MonacoApi;
  readonly editorOptions?: EditorOptions;
}

const TAB_ID = /^cf-tab-(\d+)$/;

/** 이보다 좁은 에디터(휴대폰, 좁게 나눈 그룹)는 미니맵을 끈다. 글자 영역이 미니맵에 밀려 좁아지기 때문이다. */
const MINIMAP_MIN_WIDTH = 600;

/**
 * 에디터 폭을 지켜보다가 좁으면 미니맵을 끄고 넓어지면 다시 켠다.
 * 쓰는 쪽이 `editorOptions`로 미니맵을 꺼 두었으면 건드리지 않는다.
 */
function watchMinimap(
  group: EditorGroup,
  host: HTMLElement,
  editorOptions: EditorOptions | undefined,
): Disposable {
  if (editorOptions?.minimap?.enabled === false || typeof ResizeObserver === 'undefined') {
    return { dispose: () => undefined };
  }
  let enabled: boolean | undefined;
  const observer = new ResizeObserver((entries) => {
    const width = entries.at(-1)?.contentRect.width;
    if (!width) return;
    const next = width >= MINIMAP_MIN_WIDTH;
    if (next === enabled) return;
    enabled = next;
    group.editor.updateOptions({ minimap: { enabled: next } });
  });
  observer.observe(host);
  return { dispose: () => observer.disconnect() };
}

/**
 * 저장본에서 떠 있는 그룹을 떼어 내고, 그 안에 있던 탭의 경로를 돌려준다(ADR-0042).
 * dockview는 `disableFloatingGroups`여도 저장본의 떠 있는 그룹을 그대로 되살린다.
 * 활성 탭이던 경로를 맨 뒤에 둬, 차례로 열면 그 탭이 활성으로 남는다.
 */
function splitFloatingGroups(layout: unknown): { docked: unknown; floated: string[] } {
  if (typeof layout !== 'object' || layout === null || !('floatingGroups' in layout)) {
    return { docked: layout, floated: [] };
  }
  const { floatingGroups, ...docked } = layout as SerializedDockview;
  const panels = (docked.panels ?? {}) as Record<string, { params?: { path?: unknown } }>;
  const pathOfId = (id: string) => {
    const path = panels[id]?.params?.path;
    return typeof path === 'string' ? path : undefined;
  };
  const floated: string[] = [];
  for (const { data } of Array.isArray(floatingGroups) ? floatingGroups : []) {
    if (!data) continue;
    const views = (data.views ?? []).filter((id) => id !== data.activeView);
    if (data.activeView !== undefined) views.push(data.activeView);
    for (const id of views) {
      const path = pathOfId(id);
      if (path !== undefined) floated.push(path);
    }
  }
  return { docked, floated };
}

export function createDockviewArea({
  api,
  workspace,
  monaco,
  editorOptions,
}: CreateDockviewAreaOptions): DockviewArea {
  const { registry } = workspace;
  let pendingFocus: string | undefined;
  const editors = new Map<string, GroupEditor & { readonly minimap: Disposable }>();
  /** 탭 수를 올린 패널과 그 경로. */
  const acquired = new Map<string, string>();
  const activeEmitter = createEmitter<string | undefined>();
  let counter = 0;

  const pathOf = (panel: IDockviewPanel) =>
    (panel.params as Partial<FilePanelParams> | undefined)?.path;
  const panelsOf = (path: string) => api.panels.filter((panel) => pathOf(panel) === path);

  // 이름이 같은 다른 파일이 열려 있으면 제목 뒤에 부모 경로를 붙인다. 같은 파일의 사본은 세지 않는다.
  const relabel = () => {
    const byName = new Map<string, Set<string>>();
    for (const panel of api.panels) {
      const path = pathOf(panel);
      if (path === undefined) continue;
      const paths = byName.get(nameOf(path)) ?? new Set<string>();
      paths.add(path);
      byName.set(nameOf(path), paths);
    }
    for (const panel of api.panels) {
      const path = pathOf(panel);
      if (path === undefined) continue;
      const name = nameOf(path);
      const title = (byName.get(name)?.size ?? 0) > 1 ? `${name} — ${parentOf(path) || '/'}` : name;
      if (panel.title !== title) panel.api.setTitle(title);
    }
  };

  const addPanel = (
    path: string,
    position?: Parameters<DockviewApi['addPanel']>[0]['position'],
  ) => {
    counter += 1;
    api.addPanel({
      id: `cf-tab-${counter}`,
      component: FILE_PANEL,
      title: nameOf(path),
      params: { path },
      position,
    });
    relabel();
  };

  const release = (panelId: string) => {
    const path = acquired.get(panelId);
    if (path === undefined) return;
    acquired.delete(panelId);
    registry.release(path);
  };

  const subscriptions: Disposable[] = [
    api.onDidActivePanelChange(({ panel }) =>
      activeEmitter.emit(panel ? pathOf(panel) : undefined),
    ),
    api.onDidRemovePanel((panel) => {
      release(panel.id);
      relabel();
    }),
    api.onDidRemoveGroup((group) => {
      const entry = editors.get(group.id);
      entry?.minimap.dispose();
      entry?.group.dispose();
      editors.delete(group.id);
    }),
  ];

  const area: DockviewArea = {
    api,
    open: (path) => {
      const existing = panelsOf(path);
      const active = api.activeGroup;
      const target = existing.find((panel) => panel.group === active) ?? existing[0];
      if (target) {
        target.api.setActive();
        return;
      }
      addPanel(path, active ? { referenceGroup: active } : undefined);
    },
    close: (path) => {
      for (const panel of panelsOf(path)) panel.api.close();
    },
    rename: (from, to) => {
      for (const panel of panelsOf(from)) {
        panel.api.updateParameters({ path: to });
        // 등록부가 탭 수를 새 경로로 옮겼다. 닫을 때 새 경로로 내린다.
        if (acquired.has(panel.id)) acquired.set(panel.id, to);
      }
      relabel();
    },
    focusEditor: (path) => {
      const group = api.activeGroup;
      const entry = group ? editors.get(group.id) : undefined;
      // 그 파일이 이미 활성 그룹 에디터에 보이면 바로 옮기고, 아니면 탭이 에디터를 붙일 때 옮긴다.
      if (
        path === undefined ||
        (entry?.host.isConnected && entry.group.editor.getModel() === registry.get(path))
      ) {
        pendingFocus = undefined;
        entry?.group.editor.focus();
        return;
      }
      pendingFocus = path;
    },
    takeFocusRequest: (path) => {
      if (pendingFocus !== path) return false;
      pendingFocus = undefined;
      return true;
    },
    onActiveChange: (listener) => activeEmitter.subscribe(listener),
    editorFor: (groupId) => {
      const existing = editors.get(groupId);
      if (existing) return existing;
      const host = document.createElement('div');
      host.className = 'cf:h-full cf:w-full';
      const group = createEditorGroup(monaco, registry, host, {
        editorOptions: { ...EDITOR_OPTIONS, ...editorOptions },
      });
      const entry = { group, host, minimap: watchMinimap(group, host, editorOptions) };
      editors.set(groupId, entry);
      return entry;
    },
    acquire: (panelId, path) => {
      if (acquired.get(panelId) === path) return;
      release(panelId);
      registry.acquire(path);
      acquired.set(panelId, path);
    },
    splitActive: () => {
      const panel = api.activePanel;
      const path = panel && pathOf(panel);
      if (!panel || path === undefined) return;
      addPanel(path, { referenceGroup: panel.group, direction: 'right' });
    },
    layout: () => api.toJSON(),
    restoreLayout: (layout) => {
      const { docked, floated } = splitFloatingGroups(layout);
      try {
        api.fromJSON(docked as SerializedDockview);
      } catch {
        api.clear();
        return;
      }
      // 저장한 뒤 지워진 파일의 탭은 닫는다.
      for (const panel of [...api.panels]) {
        const path = pathOf(panel);
        const node = path === undefined ? undefined : workspace.fs.getNode(path);
        if (!node || node.isDirectory) panel.api.close();
      }
      for (const panel of api.panels) {
        const match = TAB_ID.exec(panel.id);
        if (match) counter = Math.max(counter, Number(match[1]));
      }
      relabel();
      // 떠 있던 탭은 활성 그룹에 다시 연다. 그 파일이 이미 열려 있으면 그 탭을 활성화한다.
      for (const path of floated) {
        const node = workspace.fs.getNode(path);
        if (node && !node.isDirectory) area.open(path);
      }
    },
    onLayoutChange: (listener) => {
      const subscription = api.onDidLayoutChange(() => listener(api.toJSON()));
      return { dispose: () => subscription.dispose() };
    },
    dispose: () => {
      for (const subscription of subscriptions) subscription.dispose();
      for (const panelId of [...acquired.keys()]) release(panelId);
      for (const { group, minimap } of editors.values()) {
        minimap.dispose();
        group.dispose();
      }
      editors.clear();
      activeEmitter.clear();
    },
  };
  return area;
}
