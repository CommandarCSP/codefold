import { encodeText, type TextInfo, type WritableTextEncoding } from '@codefold/file-type-detector';
import type { ModelRegistry, UnexportedTracker } from '@codefold/monaco-binding';
import type { VirtualFs } from '@codefold/virtual-fs';
import { CodeEditorError } from './errors';
import { sha256Hex, utf8 } from './sha256';
import type {
  DownloadRecord,
  ExportPlan,
  ExportRequest,
  LoadedFile,
  WorkspaceSnapshot,
} from './types';

/** 내보내기와 복원이 쓰는 작업 공간 내부. */
export interface ExportContext {
  readonly fs: VirtualFs;
  readonly registry: ModelRegistry;
  readonly tracker: UnexportedTracker;
  textInfo(path: string): TextInfo | undefined;
  setTextInfo(path: string, info: TextInfo): void;
  loadFile(path: string): Promise<LoadedFile>;
  loadAsText(path: string): Promise<void>;
}

export interface WorkspaceExport {
  /**
   * 다운로드 계획과 새로 쓸 바이트를 만든다. 고친 파일만 `getValue()`로 읽고, 원래 인코딩으로 다시 쓴다.
   * 원본 바이트와 같으면 쓰지 않고 원본 복사로 둔다(ADR-0009).
   */
  createExportPlan(): Promise<ExportRequest>;
  /** 다운로드가 성공했다. 받지 않은 변경을 다시 계산하고, 저장할 다운로드 기록을 돌려준다. */
  markExported(plan: ExportPlan): DownloadRecord;
  /** 자동 저장용 스냅샷. */
  getSnapshot(): Promise<WorkspaceSnapshot>;
  /** 넘긴 경로 가운데 고친 파일의 내용만. */
  getSnapshotFor(paths: readonly string[]): Promise<Pick<WorkspaceSnapshot, 'contents'>>;
  /** 마지막 다운로드 기록. 받은 적이 없으면 `null`. */
  downloadRecord(): DownloadRecord | null;
}

/** 트리의 파일 경로(정렬). */
export function listFilePaths(fs: Pick<VirtualFs, 'children'>): string[] {
  const out: string[] = [];
  const folders = [''];
  for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
    for (const node of fs.children(folder)) {
      if (node.isDirectory) folders.push(node.path);
      else out.push(node.path);
    }
  }
  return out.sort();
}

const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

// EUC-KR 인코더는 브라우저에 없어 UTF-8로 쓴다. 그 밖에는 원래 인코딩 그대로.
const writableEncoding = (info: TextInfo | undefined): WritableTextEncoding =>
  !info || info.encoding === 'euc-kr' ? 'utf-8' : info.encoding;

// 조각마다 버퍼를 따로 가진 사본. Worker로 transfer해도 다른 데이터가 분리되지 않는다(ADR-0028).
const ownBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

export function createExporter(
  context: ExportContext,
): WorkspaceExport & { restore(snapshot: WorkspaceSnapshot): Promise<void> } {
  const { fs, registry, tracker } = context;
  let record: DownloadRecord | null = null;

  const dirtyTexts = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const path of registry.dirtyPaths()) {
      const model = registry.get(path);
      if (model) out[path] = model.getValue();
    }
    return out;
  };

  const buildPlan = async (): Promise<ExportRequest> => {
    // 버전과 내용을 같은 순간에 잡는다. 아래 await 동안 입력한 것은 받지 않은 변경으로 남는다.
    const snapshot = tracker.snapshot();
    const texts = dirtyTexts();
    const written = new Set<string>();
    const dirtyContents: Record<string, Uint8Array<ArrayBuffer>> = {};
    const hashes: Record<string, string> = {};
    for (const [path, value] of Object.entries(texts)) {
      const bytes = ownBytes(encodeText(value, writableEncoding(context.textInfo(path))));
      hashes[path] = await sha256Hex(utf8(value));
      if (fs.originalPathOf(path) !== undefined && bytesEqual(await fs.readAll(path), bytes))
        continue;
      written.add(path);
      dirtyContents[path] = bytes;
    }
    const entries = fs.exportEntries(written);
    for (const entry of entries) {
      if (entry.type !== 'write' || entry.path in dirtyContents) continue;
      // 고치지 않은 새 파일. model이 있으면 그 내용(보통 빈 내용)을 쓴다.
      dirtyContents[entry.path] = ownBytes(
        encodeText(registry.get(entry.path)?.getValue() ?? '', 'utf-8'),
      );
    }
    const plan: ExportPlan = {
      entries,
      versions: snapshot.versions,
      structureVersion: snapshot.structureVersion,
      hashes,
      paths: listFilePaths(fs),
    };
    return { plan, dirtyContents };
  };

  return {
    createExportPlan: async () => {
      // 계획을 만드는 동안 트리가 바뀌면(고친 파일의 이름 변경 등) 바뀐 경로로 처음부터 다시 만든다.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const version = fs.structureVersion();
        try {
          const request = await buildPlan();
          if (fs.structureVersion() === version) return request;
        } catch (error) {
          if (fs.structureVersion() === version) throw error;
        }
      }
      throw new CodeEditorError('트리가 계속 바뀌어 다운로드 계획을 만들지 못했습니다');
    },
    markExported: (plan) => {
      tracker.markExported({ versions: plan.versions, structureVersion: plan.structureVersion });
      record = { files: plan.hashes, paths: plan.paths, exportedAt: Date.now() };
      return record;
    },
    getSnapshot: async () => ({
      treeChanges: fs.changes(),
      contents: dirtyTexts(),
      layout: null,
      downloadRecord: record,
    }),
    getSnapshotFor: async (paths) => {
      const contents: Record<string, string> = {};
      for (const path of paths) {
        const model = registry.get(path);
        if (model && registry.isDirty(path)) contents[path] = model.getValue();
      }
      return { contents };
    },
    downloadRecord: () => record,
    restore: async (snapshot) => {
      for (const [path, value] of Object.entries(snapshot.contents)) {
        const node = fs.getNode(path);
        if (!node || node.isDirectory) continue;
        const file = await context.loadFile(path);
        // SVG처럼 텍스트로도 볼 수 있는 이미지는 텍스트 model로 연다.
        if (file.kind === 'image' && file.info) await context.loadAsText(path);
        const model = registry.get(path);
        if (file.kind === 'binary' || !model) continue;
        // 내용이 저장된 EUC-KR 파일은 사용자가 UTF-8로 바꿔 고친 파일이다.
        // 바꾸기만 하고 고치지 않았으면 내용이 원본과 같으므로, 고친 상태를 따로 되살린다.
        if (file.kind === 'text' && file.info.encoding === 'euc-kr') {
          context.setTextInfo(path, { ...file.info, encoding: 'utf-8', readOnly: false });
          if (model.getValue() === value) registry.markDirty(path);
        }
        if (model.getValue() === value) continue;
        // 한 번의 편집으로 바꿔, 복원 직후 undo로 원본에 돌아갈 수 있게 한다.
        model.pushStackElement();
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: value }],
          () => null,
        );
        model.pushStackElement();
      }
      const saved = snapshot.downloadRecord;
      if (!saved) return;
      // 지문이 같은 파일은 받은 상태로 옮긴다. 구조는 저장된 경로 목록과 비교한다(ADR-0025).
      const versions: Record<string, number> = {};
      for (const [path, hash] of Object.entries(saved.files)) {
        const model = registry.get(path);
        if (!model || !registry.isDirty(path)) continue;
        if ((await sha256Hex(utf8(model.getValue()))) === hash)
          versions[path] = model.getAlternativeVersionId();
      }
      const current = listFilePaths(fs);
      const currentSet = new Set(current);
      const savedSet = new Set(saved.paths);
      const changedPaths = [
        ...current.filter((path) => !savedSet.has(path)),
        ...saved.paths.filter((path) => !currentSet.has(path)),
      ];
      tracker.adoptRestoredExport({ versions, changedPaths });
      record = saved;
    },
  };
}
