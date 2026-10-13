import type { RenamedPath } from '@codefold/virtual-fs';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ancestorsOf, isAtOrUnder, parentOf } from './paths';

/** 트리에서 이름을 입력하는 중인지. */
export type EditingState =
  | { readonly mode: 'create'; readonly parentPath: string; readonly isDirectory: boolean }
  | { readonly mode: 'rename'; readonly path: string }
  | null;

/**
 * `<CodeEditor>` 인스턴스마다 하나씩 만드는 화면 상태(design.md "상태 위치").
 * 파일 내용과 트리 구조는 여기에 두지 않는다. 수정 여부는 등록부의 알림으로만 바뀐다.
 */
export interface EditorState {
  /** 원본과 달라진 파일. 트리 행과 탭은 자기 경로만 구독한다. */
  readonly dirty: Readonly<Record<string, true>>;
  /** 폴더 안의 고친 파일 수. 0이면 키가 없다. */
  readonly dirtyFolders: Readonly<Record<string, number>>;
  readonly expanded: ReadonlySet<string>;
  /** virtual-fs 구조 버전. 바뀌면 트리 행 목록을 다시 계산한다. */
  readonly structureVersion: number;
  /** 활성 탭의 파일. */
  readonly activePath: string | undefined;
  /** 트리의 키보드 포커스 행. */
  readonly focusedPath: string | undefined;
  readonly editing: EditingState;
  /** 편집 잠금을 잃은 탭(ADR-0024). 트리 조작을 막는다. */
  readonly readOnly: boolean;
}

export interface EditorActions {
  setDirty(path: string, dirty: boolean): void;
  setStructureVersion(version: number): void;
  toggle(path: string): void;
  expand(path: string): void;
  collapse(path: string): void;
  /** 그 경로의 부모 폴더를 모두 펼친다. */
  reveal(path: string): void;
  setActive(path: string | undefined): void;
  setFocused(path: string | undefined): void;
  startCreate(parentPath: string, isDirectory: boolean): void;
  startRename(path: string): void;
  stopEditing(): void;
  setReadOnly(readOnly: boolean): void;
  /** 이름 변경으로 옮긴 경로를 펼침·포커스·활성·입력 상태에 반영한다. */
  applyRename(moved: readonly RenamedPath[]): void;
  /** 삭제한 경로와 그 아래를 펼침·포커스·입력 상태에서 뺀다. */
  applyDelete(path: string): void;
}

export type EditorStore = StoreApi<EditorState & EditorActions>;

export function createEditorStore(): EditorStore {
  return createStore<EditorState & EditorActions>()((set, get) => {
    const withExpanded = (change: (next: Set<string>) => void) => {
      const next = new Set(get().expanded);
      change(next);
      set({ expanded: next });
    };
    return {
      dirty: {},
      dirtyFolders: {},
      expanded: new Set(),
      structureVersion: 0,
      activePath: undefined,
      focusedPath: undefined,
      editing: null,
      readOnly: false,
      setDirty: (path, dirty) => {
        const state = get();
        if ((state.dirty[path] === true) === dirty) return;
        const nextDirty: Record<string, true> = { ...state.dirty };
        if (dirty) nextDirty[path] = true;
        else delete nextDirty[path];
        const folders: Record<string, number> = { ...state.dirtyFolders };
        for (const folder of ancestorsOf(path)) {
          const count = (folders[folder] ?? 0) + (dirty ? 1 : -1);
          if (count > 0) folders[folder] = count;
          else delete folders[folder];
        }
        set({ dirty: nextDirty, dirtyFolders: folders });
      },
      setStructureVersion: (structureVersion) => set({ structureVersion }),
      toggle: (path) =>
        withExpanded((next) => {
          if (next.has(path)) next.delete(path);
          else next.add(path);
        }),
      expand: (path) => {
        if (path === '' || get().expanded.has(path)) return;
        withExpanded((next) => next.add(path));
      },
      collapse: (path) => {
        if (!get().expanded.has(path)) return;
        withExpanded((next) => next.delete(path));
      },
      reveal: (path) => {
        const missing = ancestorsOf(path).filter((folder) => !get().expanded.has(folder));
        if (missing.length === 0) return;
        withExpanded((next) => {
          for (const folder of missing) next.add(folder);
        });
      },
      setActive: (activePath) => set({ activePath }),
      setFocused: (focusedPath) => set({ focusedPath }),
      startCreate: (parentPath, isDirectory) => {
        get().expand(parentPath);
        set({ editing: { mode: 'create', parentPath, isDirectory } });
      },
      startRename: (path) => set({ editing: { mode: 'rename', path } }),
      stopEditing: () => set({ editing: null }),
      setReadOnly: (readOnly) => set({ readOnly, editing: readOnly ? null : get().editing }),
      applyRename: (moved) => {
        const map = new Map(moved.map((m) => [m.from, m.to]));
        const remap = (path: string | undefined) =>
          path === undefined ? undefined : (map.get(path) ?? path);
        const state = get();
        const editing = state.editing;
        set({
          expanded: new Set([...state.expanded].map((path) => map.get(path) ?? path)),
          focusedPath: remap(state.focusedPath),
          activePath: remap(state.activePath),
          editing:
            editing?.mode === 'rename'
              ? { mode: 'rename', path: remap(editing.path) ?? editing.path }
              : editing?.mode === 'create'
                ? { ...editing, parentPath: remap(editing.parentPath) ?? editing.parentPath }
                : editing,
        });
      },
      applyDelete: (path) => {
        const state = get();
        const gone = (value: string | undefined) => value !== undefined && isAtOrUnder(value, path);
        const parent = parentOf(path);
        const editing = state.editing;
        const editingGone =
          editing !== null && gone(editing.mode === 'rename' ? editing.path : editing.parentPath);
        set({
          expanded: new Set([...state.expanded].filter((folder) => !isAtOrUnder(folder, path))),
          focusedPath: gone(state.focusedPath) ? parent || undefined : state.focusedPath,
          editing: editingGone ? null : editing,
        });
      },
    };
  });
}
