import type { NameProblem, TreeChange } from './types';

/** 이 패키지가 던지는 모든 오류의 부모. */
export class VirtualFsError extends Error {
  override readonly name: string = 'VirtualFsError';
}

/** 트리에 없는 경로다. 최상위 폴더(`''`)를 지우거나 이름을 바꾸려 해도 이 오류다. */
export class PathNotFoundError extends VirtualFsError {
  override readonly name = 'PathNotFoundError';
  readonly path: string;
  constructor(path: string) {
    super(`없는 경로입니다: ${path}`);
    this.path = path;
  }
}

/** 폴더가 아닌 곳에 항목을 만들려 했다. */
export class NotADirectoryError extends VirtualFsError {
  override readonly name = 'NotADirectoryError';
  readonly path: string;
  constructor(path: string) {
    super(`폴더가 아닙니다: ${path}`);
    this.path = path;
  }
}

/** 폴더를 파일처럼 읽거나 내보내려 했다. */
export class NotAFileError extends VirtualFsError {
  override readonly name = 'NotAFileError';
  readonly path: string;
  constructor(path: string) {
    super(`파일이 아닙니다: ${path}`);
    this.path = path;
  }
}

/** 쓸 수 없는 이름이다. `problem`으로 이유를 구분해 입력칸에 보인다. */
export class InvalidNameError extends VirtualFsError {
  override readonly name = 'InvalidNameError';
  readonly invalidName: string;
  readonly problem: NameProblem;
  constructor(invalidName: string, problem: NameProblem) {
    super(`쓸 수 없는 이름입니다 (${problem}): ${invalidName}`);
    this.invalidName = invalidName;
    this.problem = problem;
  }
}

/** 저장된 트리 변경을 다시 적용하지 못했다. 저장본이 지금 원본과 맞지 않는다는 뜻이다. */
export class ReplayError extends VirtualFsError {
  override readonly name = 'ReplayError';
  /** 실패한 변경의 위치. 0부터 센다(메시지는 1부터 센다). */
  readonly index: number;
  readonly change: TreeChange;
  constructor(index: number, change: TreeChange, cause: unknown) {
    super(`저장된 트리 변경 ${index + 1}번째를 적용할 수 없습니다`, { cause });
    this.index = index;
    this.change = change;
  }
}
