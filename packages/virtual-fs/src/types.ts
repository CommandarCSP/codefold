/** 파일 출처의 항목 하나. zip-archive의 `ZipEntry`가 이 모양을 구조적으로 맞춘다(ADR-0016). */
export interface FileSourceEntry {
  /** 출처 안 경로. `/`로 구분한다. 정리하기 전 원본 그대로다. */
  readonly path: string;
  readonly isDirectory: boolean;
  /** 풀었을 때 크기(바이트). */
  readonly size: number;
}

/** 파일을 가져오는 곳. ZIP이면 앱이 ZIP Worker를 감싸 만든다. 모든 읽기는 비동기다. */
export interface FileSource {
  list(): Promise<readonly FileSourceEntry[]>;
  /** 판단용 앞부분. `path`는 `list()`가 돌려준 원본 경로다. */
  readHead(path: string, bytes: number): Promise<Uint8Array>;
  readAll(path: string): Promise<Uint8Array>;
}

/** 트리의 노드 하나. 메서드 없는 순수 객체이고, 경로가 바뀌면 새 객체가 된다. */
export interface TreeNode {
  /** 트리 경로. 최상위 폴더는 `''`다. */
  readonly path: string;
  readonly name: string;
  readonly isDirectory: boolean;
  /** 원본 크기(바이트). 폴더와 새로 만든 파일은 0이다. */
  readonly size: number;
}

/** 트리 구조 변경 하나. 저장해 두었다가 원본 목록에 순서대로 다시 적용한다. */
export type TreeChange =
  | { readonly type: 'add'; readonly path: string; readonly isDirectory: boolean }
  | { readonly type: 'delete'; readonly path: string }
  | { readonly type: 'rename'; readonly from: string; readonly to: string };

/** 다운로드할 ZIP에 넣을 항목 하나. 삭제한 파일은 들어가지 않는다. */
export type ExportEntry =
  | {
      /** 원본 압축 바이트를 `path` 이름으로 복사한다. */
      readonly type: 'copy';
      readonly path: string;
      readonly originalPath: string;
    }
  | {
      /** 새 내용을 쓴다. `originalPath`가 있으면 그 원본 항목의 속성을 이어받는다(ADR-0032). */
      readonly type: 'write';
      readonly path: string;
      readonly originalPath?: string;
    }
  | {
      /** 계획의 다른 항목이 그 아래에 없는 폴더(ADR-0033). 경로 끝에 `/`를 붙이지 않는다. */
      readonly type: 'directory';
      readonly path: string;
    };

/** 이름을 쓸 수 없는 이유. */
export type NameProblem = 'empty' | 'reserved' | 'invalid-character' | 'duplicate';

/** 정리가 필요한 구독. Monaco·VS Code의 관례와 같다(ADR-0017). */
export interface Disposable {
  dispose(): void;
}
