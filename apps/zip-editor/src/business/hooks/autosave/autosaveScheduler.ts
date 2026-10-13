// apps/zip-editor/src/business/hooks/autosave/autosaveScheduler.ts
import type { CodeEditorController, DownloadRecord } from '@codefold/react-code-editor';
import type { TreeChange } from '@codefold/virtual-fs';
import type { ScheduleIdle } from '@/services/browser/scheduleIdle';
import type {
  UnexportedSummary,
  WorkspaceChanges,
  WorkspaceRepository,
} from '@/services/storage/workspaceRepository';
import { affectedPaths, splitContents } from './autosaveBusiness';

export const AUTOSAVE_QUIET_MS = 1000;

export interface AutosaveDeps {
  readonly controller: Pick<CodeEditorController, 'getSnapshotFor' | 'getDirtyPaths'>;
  readonly repository: Pick<WorkspaceRepository, 'save'>;
  /** 저장본의 작업 공간 id. 저장본이 다른 ZIP으로 바뀌었으면 쓰지 않고 실패로 둔다. */
  readonly workspaceId: string;
  readonly scheduleIdle: ScheduleIdle;
  /** 복원했으면 저장본의 트리 변경, 새 ZIP이면 빈 목록. 여기에 onTreeChange를 이어 붙인다. */
  readonly initialTreeChanges: readonly TreeChange[];
  /** 저장본에 이미 내용이 있는 경로. */
  readonly savedPaths: readonly string[];
  readonly onStatus: (status: 'saved' | 'pending' | 'failed') => void;
  readonly now?: () => number;
  readonly quietMs?: number;
}

export interface AutosaveScheduler {
  /** 입력마다 부른다. 경로를 Set에 넣고 마지막 입력 시각만 바꾼다. */
  contentChanged(path: string): void;
  treeChanged(change: TreeChange): void;
  layoutChanged(layout: unknown): void;
  unexportedChanged(state: UnexportedSummary): void;
  downloadRecorded(record: DownloadRecord): void;
  /** 기다리지 않고 지금 쓴다(탭 숨김). */
  flushNow(): Promise<void>;
  /**
   * 새 저장을 막고, 저장소에 쓰기 시작한 저장이 끝나면 돌아온다. 줄에서 기다리던 저장은 버린다.
   * 저장하지 못한(버린 것 포함) 편집이 있었는지 알린다.
   */
  stop(): Promise<{ readonly hadPending: boolean }>;
}

/**
 * 입력 경로 밖에서 저장한다(ADR-0006, ADR-0014).
 * - 2026-09: 입력이 멈추고 약 1초 뒤 한가할 때 바뀐 파일만 읽는다. 타이머는 입력마다 만들지 않는다.
 * - 2026-09: 트리 변경과 다운로드 기록은 바로, 레이아웃과 받지 않은 변경 요약은 묶어서 쓴다.
 * - 2026-09: 저장 대기(이탈 경고) 상태는 편집 내용·트리·기록만 센다. 레이아웃만 남았으면 저장됨이다.
 */
export function createAutosaveScheduler(deps: AutosaveDeps): AutosaveScheduler {
  const { controller, repository, scheduleIdle, onStatus } = deps;
  // Date.now를 그때그때 부른다. 참조를 잡아 두면 테스트의 가짜 시계가 먹지 않는다.
  const now = deps.now ?? (() => Date.now());
  const quietMs = deps.quietMs ?? AUTOSAVE_QUIET_MS;
  const pendingPaths = new Set<string>();
  const saved = new Set(deps.savedPaths);
  let treeChanges: readonly TreeChange[] = deps.initialTreeChanges;
  let treeDirty = false;
  let pendingLayout: { readonly value: unknown } | undefined;
  let pendingUnexported: UnexportedSummary | undefined;
  let pendingRecord: DownloadRecord | undefined;
  let lastInput = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelIdle: (() => void) | undefined;
  let queue: Promise<void> = Promise.resolve();
  let workInFlight = 0;
  let failed = false;
  let stopped = false;
  // stop 뒤에 버린 저장에 편집 내용·트리·기록이 있었는지("마지막 입력" 안내).
  let droppedWork = false;
  let status: 'saved' | 'pending' | 'failed' = 'saved';

  const hasWork = () => pendingPaths.size > 0 || treeDirty || pendingRecord !== undefined;
  const report = () => {
    // 멈춘 뒤에는 알리지 않는다. 다음 작업 공간이나 읽기 전용 화면의 상태를 덮지 않게 한다.
    if (stopped) return;
    const next = failed ? 'failed' : hasWork() || workInFlight > 0 ? 'pending' : 'saved';
    if (next === status) return;
    status = next;
    onStatus(next);
  };

  const clearTimers = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    cancelIdle?.();
    cancelIdle = undefined;
  };

  const flush = (): Promise<void> => {
    if (stopped) return queue;
    const paths = [...pendingPaths];
    const take = {
      tree: treeDirty,
      layout: pendingLayout,
      unexported: pendingUnexported,
      record: pendingRecord,
    };
    pendingPaths.clear();
    treeDirty = false;
    pendingLayout = undefined;
    pendingUnexported = undefined;
    pendingRecord = undefined;
    const carriesWork = paths.length > 0 || take.tree || take.record !== undefined;
    if (!carriesWork && !take.layout && !take.unexported) return queue;
    if (carriesWork) workInFlight += 1;
    const write = async () => {
      try {
        // 줄에서 기다리는 사이 멈췄으면(잠금을 잃음, 새 ZIP) 쓰지 않는다. 다른 탭이 이미 읽었을 수 있다.
        if (stopped) {
          droppedWork ||= carriesWork;
          return;
        }
        const { contents } =
          paths.length > 0 ? await controller.getSnapshotFor(paths) : { contents: {} };
        if (stopped) {
          droppedWork ||= carriesWork;
          return;
        }
        const files = splitContents(paths, contents);
        const changes: WorkspaceChanges = {
          workspaceId: deps.workspaceId,
          updatedAt: now(),
          files,
          ...(take.tree ? { treeChanges } : {}),
          ...(take.layout ? { layout: take.layout.value } : {}),
          ...(take.unexported ? { unexported: take.unexported } : {}),
          ...(take.record ? { downloadRecord: take.record } : {}),
        };
        await repository.save(changes);
        for (const path of Object.keys(files.put)) saved.add(path);
        for (const path of files.remove) saved.delete(path);
        failed = false;
      } catch {
        // 다음 기회(다음 입력, 탭 숨김)에 다시 쓴다. 곧바로 다시 시도하면 용량 초과에서 같은 실패를 되풀이한다.
        for (const path of paths) pendingPaths.add(path);
        treeDirty ||= take.tree;
        pendingLayout ??= take.layout;
        pendingUnexported ??= take.unexported;
        pendingRecord ??= take.record;
        failed = true;
      } finally {
        if (carriesWork) workInFlight -= 1;
        report();
      }
    };
    queue = queue.then(write);
    report();
    return queue;
  };

  const check = () => {
    timer = undefined;
    const idleFor = now() - lastInput;
    if (idleFor < quietMs) {
      timer = setTimeout(check, quietMs - idleFor);
      return;
    }
    cancelIdle = scheduleIdle(() => {
      cancelIdle = undefined;
      void flush();
    });
  };

  const scheduleQuiet = () => {
    if (stopped) return;
    lastInput = now();
    if (timer === undefined && cancelIdle === undefined) timer = setTimeout(check, quietMs);
  };

  const flushNow = () => {
    clearTimers();
    return flush();
  };

  return {
    contentChanged: (path) => {
      if (stopped) return;
      const before = pendingPaths.size;
      pendingPaths.add(path);
      if (pendingPaths.size !== before) report();
      scheduleQuiet();
    },
    treeChanged: (change) => {
      if (stopped) return;
      treeChanges = [...treeChanges, change];
      treeDirty = true;
      for (const path of affectedPaths(change, saved, controller.getDirtyPaths()))
        pendingPaths.add(path);
      void flushNow();
    },
    layoutChanged: (layout) => {
      if (stopped) return;
      pendingLayout = { value: layout };
      scheduleQuiet();
    },
    unexportedChanged: (state) => {
      if (stopped) return;
      pendingUnexported = state;
      scheduleQuiet();
    },
    downloadRecorded: (record) => {
      if (stopped) return;
      pendingRecord = record;
      void flushNow();
    },
    flushNow,
    stop: async () => {
      const hadPending = pendingPaths.size > 0 || treeDirty;
      stopped = true;
      clearTimers();
      // 이미 저장소에 쓰기 시작한 저장만 끝나기를 기다린다. 아직 시작하지 않은 것은 write가 버린다.
      await queue;
      return { hadPending: hadPending || droppedWork };
    },
  };
}
