/** 이 패키지가 던지는 모든 오류의 부모. `instanceof ZipError`로 한꺼번에 거를 수 있다. */
export class ZipError extends Error {
  override readonly name: string = 'ZipError';
}

/** ZIP 서명과 EOCD가 없다. 확장자와 상관없이 내용으로 판단한다. */
export class NotZipError extends ZipError {
  override readonly name = 'NotZipError';
  constructor() {
    super('ZIP 파일이 아닙니다');
  }
}

/** 구조가 깨졌다. 끝이 잘렸거나, 위치가 파일 밖을 가리키거나, CRC·크기가 맞지 않는다. */
export class CorruptZipError extends ZipError {
  override readonly name = 'CorruptZipError';
  constructor(detail: string) {
    super(`ZIP 파일이 손상되었습니다: ${detail}`);
  }
}

/** 암호화된 항목이 있다. 지원 범위 밖이다(ADR-0001). */
export class EncryptedZipError extends ZipError {
  override readonly name = 'EncryptedZipError';
  constructor() {
    super('암호가 걸린 ZIP은 열 수 없습니다');
  }
}

/** 여러 파일로 나뉜 ZIP의 일부다. 지원 범위 밖이다(ADR-0001). */
export class SplitZipError extends ZipError {
  override readonly name = 'SplitZipError';
  constructor() {
    super('여러 파일로 나뉜 ZIP은 열 수 없습니다');
  }
}

/** Stored·Deflate가 아닌 압축 방식이다. 목록에는 나오지만 그 파일은 읽을 수 없다. */
export class UnsupportedCompressionError extends ZipError {
  override readonly name = 'UnsupportedCompressionError';
  readonly path: string;
  readonly method: number;
  constructor(path: string, method: number) {
    super(`지원하지 않는 압축 방식입니다 (${path}, method ${method})`);
    this.path = path;
    this.method = method;
  }
}

/** 요청한 경로의 파일 항목이 없다. 폴더 항목을 읽으려 해도 이 오류다. */
export class ZipEntryNotFoundError extends ZipError {
  override readonly name = 'ZipEntryNotFoundError';
  readonly path: string;
  constructor(path: string) {
    super(`ZIP 안에 없는 파일입니다: ${path}`);
    this.path = path;
  }
}

/** `writeZip`에 넘긴 항목을 ZIP에 쓸 수 없다. 빈 경로, `/`로 끝나는 파일 경로, 65,535바이트를 넘는 이름이다. */
export class InvalidZipItemError extends ZipError {
  override readonly name = 'InvalidZipItemError';
  readonly path: string;
  constructor(path: string, reason: string) {
    super(
      `ZIP에 쓸 수 없는 항목입니다 (${reason}): ${path.length > 80 ? `${path.slice(0, 80)}…` : path}`,
    );
    this.path = path;
  }
}
