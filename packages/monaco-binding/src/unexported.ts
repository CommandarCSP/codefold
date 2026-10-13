import { notify } from './notify';
import type { ModelRegistry } from './registry';
import type { Disposable, ExportSnapshot, StructureChange, UnexportedState } from './types';

/** 복원한 뒤 지문 비교 결과(ADR-0025). react-code-editor가 SHA-256으로 비교해 넘긴다. */
export interface RestoredExport {
  /** 지문이 기록과 같은 파일의 지금 버전. */
  readonly versions: Readonly<Record<string, number>>;
  /** 저장된 경로 목록과 지금 트리가 다른 경로. */
  readonly changedPaths: readonly string[];
}

/**
 * 마지막 다운로드 뒤 받지 않은 변경을 센다(ADR-0009). 판정이나 개수가 바뀔 때만 알린다.
 * 입력마다 버전을 보는 것은 다운로드 기록에 있는 파일뿐이다.
 */
export interface UnexportedTracker extends Disposable {
  state(): UnexportedState;
  /** 받지 않은 변경 경로. */
  paths(): readonly string[];
  /** 지금의 버전 기록. 다운로드 계획을 만들 때 받아 두었다가, 다운로드가 성공하면 `markExported`에 넘긴다. */
  snapshot(): ExportSnapshot;
  /** 다운로드가 성공했다. 그 뒤의 입력과 트리 변경은 받지 않은 변경으로 남는다. */
  markExported(snapshot: ExportSnapshot): void;
  /** 새로고침 뒤 복원할 때 지문 비교 결과로 기록을 옮긴다(ADR-0025). */
  adoptRestoredExport(restored: RestoredExport): void;
  /** 트리 구조가 바뀌었다. `structureVersion`은 바뀐 뒤의 구조 버전이다. */
  recordTreeChange(change: StructureChange, structureVersion: number): void;
  onChange(listener: (state: UnexportedState) => void): Disposable;
}

/** 받지 않은 변경 추적기를 만든다. 등록부의 알림을 구독한다. */
export function createUnexportedTracker(registry: ModelRegistry): UnexportedTracker {
  const listeners = new Set<(state: UnexportedState) => void>();
  /** 받은 시점의 `경로 → 버전`. 받은 시점에 고친 상태였던 파일만. */
  let recorded = new Map<string, number>();
  let recordedStructure = 0;
  let structureVersion = 0;
  /** 받은 뒤 트리 변경. `path`는 셈에 넣는 경로이고, 뒤에 폴더 이름이 바뀌면 새 경로로 옮긴다. */
  let structural: Array<{
    readonly version: number;
    readonly change: StructureChange;
    path: string;
  }> = [];
  /** 복원할 때 구조가 다르다고 받은 경로. 다음 다운로드까지 남는다. */
  let restored = new Set<string>();
  /** 내용이 받은 상태와 다른 경로. */
  const content = new Set<string>();
  /** 기록에 있는 파일의 입력 구독. */
  const watches = new Map<string, Disposable>();
  let last: UnexportedState = { has: false, count: 0 };

  const isContentUnexported = (path: string): boolean => {
    const version = recorded.get(path);
    const dirty = registry.isDirty(path);
    if (version === undefined) return dirty;
    return !dirty || registry.get(path)?.getAlternativeVersionId() !== version;
  };

  // 경로 하나의 내용 판정을 다시 한다. 집합이 바뀌었으면 true.
  const updateContent = (path: string): boolean => {
    const next = isContentUnexported(path);
    if (next === content.has(path)) return false;
    if (next) content.add(path);
    else content.delete(path);
    return true;
  };

  const currentPaths = (): Set<string> => {
    const paths = new Set(content);
    for (const entry of structural) if (entry.version > recordedStructure) paths.add(entry.path);
    for (const path of restored) paths.add(path);
    return paths;
  };

  const compute = (): UnexportedState => {
    const count = currentPaths().size;
    return { has: count > 0 || structureVersion !== recordedStructure, count };
  };

  const refresh = () => {
    const next = compute();
    if (next.has === last.has && next.count === last.count) return;
    last = next;
    notify(listeners, (listener) => listener(next));
  };

  // 기록에 있는 파일은 입력마다 버전이 기록과 같은지 본다(ADR-0009의 첫 조건). 기록에 없는 파일은 보지 않는다.
  const watch = (path: string) => {
    watches.get(path)?.dispose();
    watches.delete(path);
    const model = registry.get(path);
    if (!model || !recorded.has(path)) return;
    watches.set(
      path,
      model.onDidChangeContent(() => {
        if (updateContent(path)) refresh();
      }),
    );
  };

  // 트리 변경을 기록 키에 적용한다. 지운 폴더 안의 기록은 빼고(폴더 하나로 센다), 이름을 바꾼 폴더 안의 기록은
  // 새 경로로 옮긴다. model이 있는 파일은 등록부의 이름 변경 알림으로 이미 옮겨졌고, 남은 것은 어떤 버전과도 같지 않게 둔다.
  const applyToRecord = (change: StructureChange) => {
    if (change.type === 'add') return;
    const root = change.type === 'delete' ? change.path : change.from;
    for (const key of [...recorded.keys()]) {
      if (key !== root && !key.startsWith(`${root}/`)) continue;
      recorded.delete(key);
      if (change.type === 'rename') recorded.set(change.to + key.slice(root.length), Number.NaN);
    }
  };

  const rebuild = () => {
    for (const subscription of watches.values()) subscription.dispose();
    watches.clear();
    content.clear();
    for (const path of new Set([...recorded.keys(), ...registry.dirtyPaths()])) updateContent(path);
    for (const path of recorded.keys()) watch(path);
    refresh();
  };

  const subscriptions: Disposable[] = [
    registry.onDirtyChange((path) => {
      if (updateContent(path)) refresh();
    }),
    registry.onDidReplaceModel(({ from, to }) => {
      if (recorded.has(from)) {
        // 기록 버전은 그 model에서만 뜻이 있다. 새 model의 버전은 1부터 다시 세므로 우연히 같아질 수 있다.
        // 이름 변경으로 옮길 때 내용이 받은 상태와 같았으면 새 model의 지금 버전으로 잇고,
        // 그 밖(되돌리기, 지움, 받은 뒤 고친 파일의 이름 변경)은 어떤 버전과도 같지 않은 NaN으로 둔다.
        const sameAsExported = !content.has(from);
        const next = to === undefined ? undefined : registry.get(to);
        recorded.delete(from);
        recorded.set(
          to ?? from,
          to !== from && sameAsExported && next ? next.getAlternativeVersionId() : Number.NaN,
        );
      }
      watch(from);
      if (to !== undefined) watch(to);
      const changed = [updateContent(from), to !== undefined && updateContent(to)].some(Boolean);
      if (changed) refresh();
    }),
  ];

  return {
    state: () => last,
    paths: () => [...currentPaths()],
    snapshot: () => {
      const versions: Record<string, number> = {};
      for (const path of registry.dirtyPaths()) {
        const model = registry.get(path);
        if (!model) continue;
        // Monaco는 이어 친 글자를 undo 한 단계로 묶는다. 묶음을 여기서 끊어야 나중에 undo로 이 상태에 돌아올 수 있다.
        // 버전 번호는 바뀌지 않는다.
        model.pushStackElement();
        versions[path] = model.getAlternativeVersionId();
      }
      return { versions, structureVersion };
    },
    markExported: (snapshot) => {
      recorded = new Map(Object.entries(snapshot.versions));
      recordedStructure = snapshot.structureVersion;
      structural = structural.filter((entry) => entry.version > snapshot.structureVersion);
      // 계획을 만든 뒤 받기 전에 바뀐 트리 구조를 기록에도 적용한다(그 사이의 이름 변경·삭제).
      for (const entry of structural) applyToRecord(entry.change);
      restored = new Set();
      rebuild();
    },
    adoptRestoredExport: (input) => {
      recorded = new Map(Object.entries(input.versions));
      recordedStructure = structureVersion;
      structural = [];
      restored = new Set(input.changedPaths);
      rebuild();
    },
    recordTreeChange: (change, version) => {
      structureVersion = version;
      applyToRecord(change);
      const after = (entry: { readonly version: number }) => entry.version > recordedStructure;
      if (change.type === 'rename') {
        // 받은 뒤 추가한 항목의 이름을 바꾸면 추가한 경로를 새 경로로 바꾼다(1개로 센다).
        // 받은 뒤 폴더 안에 생긴 경로는 새 폴더 경로로 옮긴다.
        structural = structural.filter((entry) => !(after(entry) && entry.path === change.from));
        for (const entry of structural) {
          if (after(entry) && entry.path.startsWith(`${change.from}/`)) {
            entry.path = change.to + entry.path.slice(change.from.length);
          }
        }
        structural.push({ version, change, path: change.to });
      } else {
        if (change.type === 'delete') {
          structural = structural.filter(
            (entry) => !(after(entry) && entry.path.startsWith(`${change.path}/`)),
          );
        }
        structural.push({ version, change, path: change.path });
      }
      // 복원 때 받은 구조 차이 경로도 같은 규칙을 따른다. 그 경로 자신의 변경은 방금 넣은 항목이 센다.
      const root = change.type === 'rename' ? change.from : change.path;
      if (change.type !== 'add') {
        const next = new Set<string>();
        for (const path of restored) {
          if (path === root) continue;
          if (path.startsWith(`${root}/`)) {
            if (change.type === 'rename') next.add(change.to + path.slice(root.length));
            continue;
          }
          next.add(path);
        }
        restored = next;
      }
      rebuild();
    },
    onChange: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    dispose: () => {
      listeners.clear();
      for (const subscription of [...subscriptions, ...watches.values()]) subscription.dispose();
      watches.clear();
    },
  };
}
