import type { FileKind, TextInfo } from '@codefold/file-type-detector';
import type { Disposable, ExportEntry, TreeChange } from '@codefold/virtual-fs';

/**
 * 에디터 영역(dockview 탭·그룹). 작업 공간은 이 모양만 알고, 구현은 `<CodeEditor>`가 만든다.
 */
export interface EditorAreaPort {
  /** 활성 그룹에 그 파일의 탭을 연다. 이미 열려 있으면 그 탭을 활성화한다. */
  open(path: string): void;
  /** 모든 그룹에서 그 파일의 탭을 닫는다. */
  close(path: string): void;
  /** 그 파일의 탭을 같은 자리에서 새 경로로 바꾼다. */
  rename(from: string, to: string): void;
  /**
   * 활성 그룹의 에디터로 포커스를 옮긴다. `path`를 주면 그 파일이 탭에 보인 뒤에 옮긴다.
   * 막 연 파일은 비동기로 읽혀 에디터가 아직 그 탭에 붙지 않았을 수 있기 때문이다.
   */
  focusEditor(path?: string): void;
  /** 활성 탭의 파일이 바뀔 때 부른다. 탭이 없으면 `undefined`. */
  onActiveChange(listener: (path: string | undefined) => void): Disposable;
}

/** 연 파일. 텍스트는 model이 등록부에 있고, 이미지는 바이트를 가진다. */
export type LoadedFile =
  | {
      readonly kind: 'text';
      readonly path: string;
      readonly info: TextInfo;
      readonly detected: FileKind;
    }
  | {
      readonly kind: 'image';
      readonly path: string;
      readonly mime: string;
      readonly bytes: Uint8Array;
      /** SVG처럼 텍스트로도 볼 수 있는 이미지만 가진다. */
      readonly info: TextInfo | undefined;
      readonly detected: FileKind;
    }
  | { readonly kind: 'binary'; readonly path: string; readonly detected: FileKind };

/** 다운로드 기록(ADR-0025). 지문만 두고 내용은 두지 않는다. */
export interface DownloadRecord {
  /** 경로 → SHA-256 지문(hex). 받은 순간 고친 상태였던 파일만. */
  readonly files: Readonly<Record<string, string>>;
  /** 받은 순간의 파일 경로 목록(구조 스냅샷). */
  readonly paths: readonly string[];
  readonly exportedAt: number;
}

/** 자동 저장용 스냅샷(design.md). 원본 목록에 `treeChanges`를 다시 적용하고 `contents`로 내용을 되살린다. */
export interface WorkspaceSnapshot {
  readonly treeChanges: readonly TreeChange[];
  /** 원본과 달라진 텍스트 파일만. */
  readonly contents: Readonly<Record<string, string>>;
  /** 에디터 영역 배치(dockview `toJSON()`). 저장한 배치가 없으면 `null`이다. */
  readonly layout: unknown;
  readonly downloadRecord: DownloadRecord | null;
}

/** 다운로드 계획. 순수 데이터라 ZIP Worker로 그대로 보낸다. */
export interface ExportPlan {
  readonly entries: readonly ExportEntry[];
  /** 계획을 만든 순간의 고친 파일 버전. */
  readonly versions: Readonly<Record<string, number>>;
  readonly structureVersion: number;
  /** 고친 파일의 SHA-256 지문. 편집 텍스트를 UTF-8로 인코딩한 바이트 기준. */
  readonly hashes: Readonly<Record<string, string>>;
  /** 계획을 만든 순간의 파일 경로 목록. 다운로드 기록의 구조 스냅샷이 된다. */
  readonly paths: readonly string[];
}

/** 계획과 새로 쓸 파일 바이트. 바이트는 조각마다 버퍼를 따로 가진다(Worker로 transfer). */
export interface ExportRequest {
  readonly plan: ExportPlan;
  readonly dirtyContents: Readonly<Record<string, Uint8Array<ArrayBuffer>>>;
}
