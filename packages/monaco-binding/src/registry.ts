import { ModelNotFoundError, MonacoBindingError } from './errors';
import { notify } from './notify';
import type { Disposable, MonacoApi, TextModel } from './types';

/** model을 새로 만들거나 지웠다. 이름 변경은 `{ from, to }`, 되돌리기는 `from === to`, 지움은 `to: undefined`다. */
export interface ModelReplacedEvent {
  readonly from: string;
  readonly to: string | undefined;
}

/**
 * 파일마다 Monaco model 하나를 관리한다(ADR-0006). 경로는 트리 경로(앞 `/` 없음)이고 URI는 `file:///경로`다.
 * 수정 여부는 원본 버전과 현재 `getAlternativeVersionId()`의 정수 비교로 정하고, 바뀔 때만 알린다.
 */
export interface ModelRegistry extends Disposable {
  /** 그 경로의 model. 없으면 `text`로 만들고 지금 버전을 원본 버전으로 기록한다. 있으면 `text`는 무시한다. */
  open(path: string, text: string): TextModel;
  get(path: string): TextModel | undefined;
  isDirty(path: string): boolean;
  dirtyPaths(): readonly string[];
  /** 탭 하나가 이 파일을 연다. */
  acquire(path: string): void;
  /** 탭 하나가 닫힌다. 탭이 하나도 없고 안 고친 파일이면 model을 지운다. */
  release(path: string): void;
  /** 파일을 지웠다. 고쳤어도 model을 지운다. */
  remove(path: string): void;
  /**
   * 이름을 바꿨다. model이 있으면 새 URI로 다시 만들어 내용·탭 수·수정 여부를 옮기고 옛 model을 지운다.
   * undo 기록은 끊긴다. 고친 파일은 돌아갈 원본이 없어 새 이름에서 계속 고친 상태다.
   * @throws {MonacoBindingError} `to`에 이미 model이 있다.
   */
  rename(from: string, to: string): void;
  /**
   * 원본으로 되돌린다. model을 지우고, 탭이 열려 있으면 `originalText`로 새 model을 만든다.
   * 고친 내용과 undo 기록은 되살릴 수 없다.
   */
  revert(path: string, originalText: string): void;
  /**
   * 내용은 그대로 두고 고친 상태로 만든다. EUC-KR 파일을 UTF-8로 바꿔 편집할 때 쓴다.
   * 원본 버전을 `NaN`으로 두어 undo로도 원본 상태가 되지 않는다.
   * @throws {ModelNotFoundError} 그 경로의 model이 없다.
   */
  markDirty(path: string): void;
  /** 수정 여부가 바뀔 때만 부른다. 입력이 이어질 때는 부르지 않는다. */
  onDirtyChange(listener: (path: string, dirty: boolean) => void): Disposable;
  /** model을 새로 만들거나 지울 때 부른다. 에디터 그룹이 이 알림으로 화면을 바꾼다. */
  onDidReplaceModel(listener: (event: ModelReplacedEvent) => void): Disposable;
}

interface Entry {
  readonly model: TextModel;
  /** 원본 버전. 이름을 바꾼 고친 파일과 `markDirty`한 파일은 돌아갈 원본이 없어 `NaN`(늘 고친 상태)이다. */
  baseline: number;
  dirty: boolean;
  refs: number;
  readonly subscription: Disposable;
}

/** model 등록부를 만든다. Monaco는 쓰는 쪽이 넘긴다. */
export function createModelRegistry(monaco: MonacoApi): ModelRegistry {
  const entries = new Map<string, Entry>();
  const dirtyListeners = new Set<(path: string, dirty: boolean) => void>();
  const replacedListeners = new Set<(event: ModelReplacedEvent) => void>();

  const uriOf = (path: string) => monaco.Uri.file(`/${path}`);

  const setDirty = (path: string, entry: Entry, dirty: boolean) => {
    if (entry.dirty === dirty) return;
    entry.dirty = dirty;
    notify(dirtyListeners, (listener) => listener(path, dirty));
  };

  const track = (
    path: string,
    model: TextModel,
    baseline: number,
    refs: number,
    dirty: boolean,
  ): Entry => {
    const subscription = model.onDidChangeContent(() => {
      // 입력마다 여기까지 온다. 정수 비교 하나로 끝나고, 판단이 바뀔 때만 알린다.
      setDirty(path, entry, model.getAlternativeVersionId() !== entry.baseline);
    });
    const entry: Entry = { model, baseline, dirty, refs, subscription };
    entries.set(path, entry);
    return entry;
  };

  const drop = (path: string, entry: Entry) => {
    entries.delete(path);
    entry.subscription.dispose();
    entry.model.dispose();
  };

  const replaced = (event: ModelReplacedEvent) =>
    notify(replacedListeners, (listener) => listener(event));

  const existing = (path: string): Entry => {
    const entry = entries.get(path);
    if (!entry) throw new ModelNotFoundError(path);
    return entry;
  };

  const subscribe = <L>(listeners: Set<L>, listener: L): Disposable => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  };

  return {
    open: (path, text) => {
      const current = entries.get(path);
      if (current) return current.model;
      const model = monaco.editor.createModel(text, undefined, uriOf(path));
      return track(path, model, model.getAlternativeVersionId(), 0, false).model;
    },
    get: (path) => entries.get(path)?.model,
    isDirty: (path) => entries.get(path)?.dirty ?? false,
    dirtyPaths: () => [...entries].filter(([, entry]) => entry.dirty).map(([path]) => path),
    acquire: (path) => {
      existing(path).refs += 1;
    },
    release: (path) => {
      const entry = entries.get(path);
      if (!entry) return;
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs > 0 || entry.dirty) return;
      drop(path, entry);
      replaced({ from: path, to: undefined });
    },
    remove: (path) => {
      const entry = entries.get(path);
      if (!entry) return;
      const wasDirty = entry.dirty;
      drop(path, entry);
      replaced({ from: path, to: undefined });
      if (wasDirty) notify(dirtyListeners, (listener) => listener(path, false));
    },
    rename: (from, to) => {
      const entry = entries.get(from);
      if (!entry) return;
      if (entries.has(to))
        throw new MonacoBindingError(`이미 model이 있는 경로로 옮길 수 없습니다: ${to}`);
      const model = monaco.editor.createModel(entry.model.getValue(), undefined, uriOf(to));
      const baseline = entry.dirty ? Number.NaN : model.getAlternativeVersionId();
      track(to, model, baseline, entry.refs, entry.dirty);
      // 옛 model을 지우기 전에 새 model을 만들어 두고, 지운 뒤 알린다. 에디터 그룹은 옛 model이 지워질 때 뷰 상태를 저장해 둔다.
      drop(from, entry);
      replaced({ from, to });
      if (entry.dirty) {
        notify(dirtyListeners, (listener) => listener(from, false));
        notify(dirtyListeners, (listener) => listener(to, true));
      }
    },
    markDirty: (path) => {
      const entry = existing(path);
      entry.baseline = Number.NaN;
      setDirty(path, entry, true);
    },
    revert: (path, originalText) => {
      const entry = entries.get(path);
      if (!entry) return;
      const wasDirty = entry.dirty;
      drop(path, entry);
      if (entry.refs > 0) {
        // 같은 URI의 model은 하나만 있을 수 있어 옛 model을 먼저 지운다.
        const model = monaco.editor.createModel(originalText, undefined, uriOf(path));
        track(path, model, model.getAlternativeVersionId(), entry.refs, false);
        replaced({ from: path, to: path });
      } else {
        replaced({ from: path, to: undefined });
      }
      if (wasDirty) notify(dirtyListeners, (listener) => listener(path, false));
    },
    onDirtyChange: (listener) => subscribe(dirtyListeners, listener),
    onDidReplaceModel: (listener) => subscribe(replacedListeners, listener),
    dispose: () => {
      dirtyListeners.clear();
      replacedListeners.clear();
      for (const [path, entry] of [...entries]) drop(path, entry);
    },
  };
}
