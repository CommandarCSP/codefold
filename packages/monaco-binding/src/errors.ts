/** 이 패키지가 던지는 모든 오류의 부모. */
export class MonacoBindingError extends Error {
  override readonly name: string = 'MonacoBindingError';
}

/** 그 경로의 model이 등록부에 없다. 먼저 `open`해야 한다. */
export class ModelNotFoundError extends MonacoBindingError {
  override readonly name = 'ModelNotFoundError';
  readonly path: string;
  constructor(path: string) {
    super(`model이 없습니다: ${path}`);
    this.path = path;
  }
}
