/** 이 패키지가 던지는 모든 오류의 부모. */
export class CodeEditorError extends Error {
  override readonly name: string = 'CodeEditorError';
}

/** 텍스트가 아닌 파일(이미지, 바이너리)을 텍스트로 읽으려 했다. */
export class NotTextFileError extends CodeEditorError {
  override readonly name = 'NotTextFileError';
  readonly path: string;
  constructor(path: string) {
    super(`텍스트 파일이 아닙니다: ${path}`);
    this.path = path;
  }
}

/** 읽는 동안 파일의 이름이 바뀌었거나 지워졌거나, 작업 공간이 닫혔다. 그 읽기 결과는 버린다. */
export class FileChangedError extends CodeEditorError {
  override readonly name = 'FileChangedError';
  readonly path: string;
  constructor(path: string) {
    super(`읽는 동안 파일이 바뀌었습니다: ${path}`);
    this.path = path;
  }
}
