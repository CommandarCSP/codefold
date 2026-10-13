import { decodeText, type TextInfo } from '@codefold/file-type-detector';
import {
  createModelRegistry,
  createUnexportedTracker,
  type ModelRegistry,
  type MonacoApi,
  type UnexportedState,
  type UnexportedTracker,
} from '@codefold/monaco-binding';
import {
  createVirtualFs,
  type Disposable,
  type FileSource,
  type TreeChange,
  type VirtualFs,
} from '@codefold/virtual-fs';
import { createEmitter } from './emitter';
import { FileChangedError, NotTextFileError } from './errors';
import { readOriginal, toLoaded } from './files';
import { createExporter, type WorkspaceExport } from './export-plan';
import { createOperations, type WorkspaceOperations } from './operations';
import { createEditorStore, type EditorStore } from './store';
import type { EditorAreaPort, LoadedFile, WorkspaceSnapshot } from './types';

export interface CreateEditorWorkspaceOptions {
  readonly source: FileSource;
  /** 쓰는 쪽이 불러온 Monaco(`import * as monaco from 'monaco-editor'`). */
  readonly monaco: MonacoApi;
  /** 복원할 때만. */
  readonly initialSnapshot?: WorkspaceSnapshot;
}

/**
 * 헤드리스 패키지 셋을 묶은 작업 공간(ADR-0022). 트리·model·받지 않은 변경·화면 상태가 어긋나지 않게
 * 순서를 지켜 부른다. 팩토리로 만든 객체라 메서드를 콜백으로 넘겨도 된다(ADR-0017).
 */
export interface EditorWorkspace extends Disposable, WorkspaceOperations, WorkspaceExport {
  readonly fs: VirtualFs;
  readonly registry: ModelRegistry;
  readonly tracker: UnexportedTracker;
  readonly store: EditorStore;
  /** 에디터 영역을 붙인다. 돌려받은 값을 dispose하면 뗀다. */
  attachArea(area: EditorAreaPort): Disposable;
  /** 파일의 탭을 연다. 영역이 없으면 아무것도 하지 않는다. */
  openFile(path: string): void;
  /** 파일을 열라는 요청(트리에서 고르기, `openFile`)마다 부른다. 이미 열린 파일이어도 부른다. */
  onFileOpen(listener: (path: string) => void): Disposable;
  /** 에디터로 포커스를 옮긴다. `path`를 주면 그 파일이 탭에 보인 뒤에 옮긴다. */
  focusEditor(path?: string): void;
  /** 파일을 읽어 종류를 판단하고, 텍스트면 model을 만든다. 같은 파일은 한 번만 읽는다. */
  loadFile(path: string): Promise<LoadedFile>;
  /** 연 텍스트 파일의 인코딩 정보. */
  textInfo(path: string): TextInfo | undefined;
  /** 텍스트를 읽는다. model이 있으면 model에서, 없으면 원본에서(model을 만들지 않는다). */
  readText(path: string): Promise<string>;
  /** 원본과 다른 파일이 있거나 트리 구조가 바뀌었는지(다운로드 버튼). */
  hasChanges(): boolean;
  getDirtyPaths(): readonly string[];
  getUnexportedCount(): number;
  onDirtyChange(listener: (path: string, dirty: boolean) => void): Disposable;
  onChangesChange(listener: (hasChanges: boolean) => void): Disposable;
  onUnexportedChange(listener: (state: UnexportedState) => void): Disposable;
  /** 입력마다 부른다. React 상태로 올리지 말 것(자동 저장의 "바뀐 경로" 표시용). */
  onContentChange(listener: (path: string) => void): Disposable;
  onTreeChange(listener: (change: TreeChange) => void): Disposable;
  /** 연 EUC-KR 텍스트를 UTF-8 편집으로 바꾸고 고친 상태로 만든다. 다운로드하면 UTF-8로 쓴다. */
  convertToUtf8(path: string): void;
  /** SVG처럼 텍스트로도 볼 수 있는 이미지를 텍스트 model로 연다. 이미 열려 있으면 아무것도 하지 않는다. */
  loadAsText(path: string): Promise<void>;
  /** 연 파일의 텍스트 정보(인코딩, 읽기 전용)가 바뀔 때 부른다. */
  onFileInfoChange(listener: (path: string) => void): Disposable;
}

/** 작업 공간을 만든다. 파일 출처의 목록을 한 번 읽고, 스냅샷이 있으면 트리 변경을 다시 적용한다. */
export async function createEditorWorkspace(
  options: CreateEditorWorkspaceOptions,
): Promise<EditorWorkspace> {
  const snapshot = options.initialSnapshot;
  const fs = await createVirtualFs(options.source, { changes: snapshot?.treeChanges });
  const registry = createModelRegistry(options.monaco);
  const tracker = createUnexportedTracker(registry);
  const store = createEditorStore();
  store.getState().setStructureVersion(fs.structureVersion());
  // 다시 적용한 트리 변경도 받지 않은 변경으로 센다. 다운로드 기록이 있으면 복원할 때 기록으로 옮긴다.
  fs.changes().forEach((change, index) => tracker.recordTreeChange(change, index + 1));

  const loaded = new Map<string, LoadedFile>();
  /** 코드로 연 SVG의 텍스트 정보. 이미지는 바이트를 붙잡아 두지 않으므로 정보만 따로 둔다. */
  const imageTextInfos = new Map<string, TextInfo>();
  const infoEmitter = createEmitter<string>();
  const openEmitter = createEmitter<string>();
  const pending = new Map<string, Promise<LoadedFile>>();
  const contentWatches = new Map<string, Disposable>();
  const dirtyEmitter = createEmitter<{ readonly path: string; readonly dirty: boolean }>();
  const changesEmitter = createEmitter<boolean>();
  const contentEmitter = createEmitter<string>();
  const treeEmitter = createEmitter<TreeChange>();
  let area: EditorAreaPort | undefined;
  let disposed = false;
  // 경로마다 이름 변경·삭제 때 오르는 번호. 읽기를 시작할 때 번호를 기억해, 끝났을 때 달라졌으면 결과를 버린다.
  const generations = new Map<string, number>();
  const generationOf = (path: string) => generations.get(path) ?? 0;
  const isCurrent = (path: string, generation: number) =>
    !disposed && generationOf(path) === generation;

  const hasChanges = () => registry.dirtyPaths().length > 0 || fs.structureVersion() > 0;
  let lastHasChanges = hasChanges();
  const refreshChanges = () => {
    const next = hasChanges();
    if (next === lastHasChanges) return;
    lastHasChanges = next;
    changesEmitter.emit(next);
  };

  const watchContent = (path: string) => {
    contentWatches.get(path)?.dispose();
    contentWatches.delete(path);
    const model = registry.get(path);
    if (model)
      contentWatches.set(
        path,
        model.onDidChangeContent(() => contentEmitter.emit(path)),
      );
  };

  const subscriptions: Disposable[] = [
    registry.onDirtyChange((path, dirty) => {
      store.getState().setDirty(path, dirty);
      dirtyEmitter.emit({ path, dirty });
      refreshChanges();
    }),
    registry.onDidReplaceModel(({ from, to }) => {
      contentWatches.get(from)?.dispose();
      contentWatches.delete(from);
      if (to === undefined) {
        loaded.delete(from);
        imageTextInfos.delete(from);
        return;
      }
      const file = loaded.get(from);
      if (file && from !== to) {
        loaded.delete(from);
        loaded.set(to, { ...file, path: to });
      }
      watchContent(to);
    }),
    // 트리 변경 알림(onTreeChange)은 등록부·추적기까지 다 바꾼 뒤 조작 쪽에서 낸다. 여기서는 행 목록만 다시 계산하게 한다.
    fs.onDidChange(({ structureVersion }) =>
      store.getState().setStructureVersion(structureVersion),
    ),
  ];

  const loadFile = (path: string): Promise<LoadedFile> => {
    const cached = loaded.get(path);
    // 텍스트는 model이 남아 있을 때만 다시 쓴다. 탭이 닫혀 model이 지워졌으면 다시 읽는다.
    if (cached && (cached.kind !== 'text' || registry.get(path))) return Promise.resolve(cached);
    const inFlight = pending.get(path);
    if (inFlight) return inFlight;
    const generation = generationOf(path);
    const promise = readOriginal(fs, path)
      .then((original) => {
        // 읽는 동안 이름이 바뀌었거나 지워졌거나 작업 공간이 닫혔으면, 옛 경로에 model을 만들지 않는다.
        if (!isCurrent(path, generation)) throw new FileChangedError(path);
        if (original.kind === 'text') {
          registry.open(path, original.text);
          watchContent(path);
        }
        const file = toLoaded(path, original);
        // 이미지 바이트는 붙잡아 두지 않는다. 열 때마다 다시 읽는다.
        if (file.kind !== 'image') loaded.set(path, file);
        return file;
      })
      .catch((error: unknown) => {
        // 읽는 도중 경로가 없어져 난 오류(PathNotFoundError 등)도 "바뀌었다"로 알린다.
        if (!isCurrent(path, generation)) throw new FileChangedError(path);
        throw error;
      })
      .finally(() => pending.delete(path));
    pending.set(path, promise);
    return promise;
  };

  const loadAsText = async (path: string): Promise<void> => {
    if (registry.get(path)) return;
    const generation = generationOf(path);
    const original = await readOriginal(fs, path);
    if (!isCurrent(path, generation)) throw new FileChangedError(path);
    if (original.kind === 'text') {
      registry.open(path, original.text);
      loaded.set(path, toLoaded(path, original));
    } else if (original.kind === 'image' && original.info) {
      // 이미지 바이트는 붙잡아 두지 않고, 텍스트로 읽은 인코딩 정보만 둔다.
      registry.open(path, decodeText(original.bytes, original.info.encoding));
      imageTextInfos.set(path, original.info);
    } else {
      return;
    }
    watchContent(path);
    infoEmitter.emit(path);
  };

  const exporter = createExporter({
    fs,
    registry,
    tracker,
    textInfo: (path) => {
      const file = loaded.get(path);
      return file?.kind === 'text' ? file.info : imageTextInfos.get(path);
    },
    setTextInfo: (path, info) => {
      const file = loaded.get(path);
      if (file?.kind === 'text') loaded.set(path, { ...file, info });
    },
    loadFile: (path) => loadFile(path),
    loadAsText,
  });
  const { restore, ...exportApi } = exporter;

  const operations = createOperations({
    fs,
    registry,
    tracker,
    store,
    area: () => area,
    setLoaded: (path, file) => {
      loaded.set(path, file);
      // 되돌리기로 EUC-KR 읽기 전용이 돌아오는 경우 등, 보기가 텍스트 정보를 다시 읽게 한다.
      infoEmitter.emit(path);
    },
    moveLoaded: (from, to) => {
      const file = loaded.get(from);
      if (file) {
        loaded.delete(from);
        loaded.set(to, { ...file, path: to });
      }
      const info = imageTextInfos.get(from);
      if (info) {
        imageTextInfos.delete(from);
        imageTextInfos.set(to, info);
      }
    },
    forgetLoaded: (path) => {
      loaded.delete(path);
      imageTextInfos.delete(path);
    },
    watchContent,
    contentChanged: (path) => contentEmitter.emit(path),
    invalidate: (path) => {
      generations.set(path, generationOf(path) + 1);
      pending.delete(path);
    },
    generationOf,
    isCurrent,
    treeChanged: (change) => {
      treeEmitter.emit(change);
      refreshChanges();
    },
  });

  const workspace: EditorWorkspace = {
    fs,
    registry,
    tracker,
    store,
    ...operations,
    ...exportApi,
    attachArea: (next) => {
      area = next;
      const subscription = next.onActiveChange((path) => {
        store.getState().setActive(path);
        if (path !== undefined) store.getState().reveal(path);
      });
      return {
        dispose: () => {
          subscription.dispose();
          if (area === next) area = undefined;
        },
      };
    },
    openFile: (path) => {
      area?.open(path);
      openEmitter.emit(path);
    },
    onFileOpen: (listener) => openEmitter.subscribe(listener),
    focusEditor: (path) => area?.focusEditor(path),
    loadFile,
    textInfo: (path) => {
      const file = loaded.get(path);
      return file?.kind === 'text' ? file.info : imageTextInfos.get(path);
    },
    readText: async (path) => {
      const model = registry.get(path);
      if (model) return model.getValue();
      const original = await readOriginal(fs, path);
      if (original.kind !== 'text') throw new NotTextFileError(path);
      return original.text;
    },
    hasChanges,
    getDirtyPaths: () => registry.dirtyPaths(),
    getUnexportedCount: () => tracker.state().count,
    onDirtyChange: (listener) => dirtyEmitter.subscribe(({ path, dirty }) => listener(path, dirty)),
    onChangesChange: (listener) => changesEmitter.subscribe(listener),
    onUnexportedChange: (listener) => tracker.onChange(listener),
    onContentChange: (listener) => contentEmitter.subscribe(listener),
    onTreeChange: (listener) => treeEmitter.subscribe(listener),
    convertToUtf8: (path) => {
      const file = loaded.get(path);
      if (file?.kind !== 'text' || file.info.encoding !== 'euc-kr') return;
      loaded.set(path, { ...file, info: { ...file.info, encoding: 'utf-8', readOnly: false } });
      registry.markDirty(path);
      infoEmitter.emit(path);
      // 내용은 그대로지만 저장할 인코딩이 바뀌었다. 자동 저장이 듣게 한다.
      contentEmitter.emit(path);
    },
    loadAsText,
    onFileInfoChange: (listener) => infoEmitter.subscribe(listener),
    dispose: () => {
      disposed = true;
      pending.clear();
      for (const subscription of [...subscriptions, ...contentWatches.values()])
        subscription.dispose();
      contentWatches.clear();
      for (const emitter of [
        dirtyEmitter,
        changesEmitter,
        contentEmitter,
        treeEmitter,
        infoEmitter,
        openEmitter,
      ])
        emitter.clear();
      tracker.dispose();
      registry.dispose();
    },
  };
  if (snapshot) {
    try {
      await restore(snapshot);
    } catch (error) {
      // 복원이 중간에 실패하면 연 model을 모두 치운다. 그래야 같은 스냅샷으로 다시 시도할 수 있다.
      workspace.dispose();
      throw error;
    }
  }
  return workspace;
}
