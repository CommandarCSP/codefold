/**
 * 범위를 읽을 수 있는 바이트 출처. `Blob`은 `blobSource`로 바꿔 쓴다.
 * 테스트에서 어떤 범위를 읽었는지 기록하거나, 다른 저장소(HTTP Range 등)를 붙일 때 쓴다.
 */
export interface ByteSource {
  readonly size: number;
  /** `[start, end)` 범위를 읽는다. 돌려주는 배열은 버퍼를 따로 가진다(transfer 가능). */
  read(start: number, end: number): Promise<Uint8Array<ArrayBuffer>>;
  /** 복사하지 않는 `Blob` 조각. 스트림 압축 해제와 원본 바이트 복사에 쓴다. */
  slice(start: number, end: number): Blob;
}

/** 파일 이름을 어떤 인코딩으로 읽었는지. */
export type NameEncoding = 'utf-8' | 'cp949' | 'cp437';

/** Central Directory의 항목 하나. 순수 객체라 Worker 메시지로 그대로 넘길 수 있다(ADR-0017). */
export interface ZipEntry {
  /** Central Directory 안의 순서(0부터). */
  readonly index: number;
  /** ZIP 안 경로. `/`로 구분하고, 폴더도 끝의 `/` 없이 적는다. NFC로 정규화했다. */
  readonly path: string;
  readonly isDirectory: boolean;
  /** 풀었을 때 크기(바이트). */
  readonly size: number;
  readonly compressedSize: number;
  /** 0 = Stored, 8 = Deflate. 그 밖의 값은 읽을 수 없다. */
  readonly method: number;
  readonly crc32: number;
  readonly flags: number;
  readonly nameEncoding: NameEncoding;
  readonly localHeaderOffset: number;
  readonly dosTime: number;
  readonly dosDate: number;
  readonly versionMadeBy: number;
  readonly externalAttributes: number;
}

/** 원본 압축 바이트. `writeZip`의 `raw` 항목으로 넘기면 다시 압축하지 않고 옮긴다. */
export interface RawZipEntry {
  readonly entry: ZipEntry;
  /** 로컬 헤더와 데이터 기술자를 뺀 압축 데이터. */
  readonly data: Blob;
}

/** `writeZip`에 넘기는 항목. */
export type ZipWriteItem =
  | {
      /** 원본 압축 바이트를 그대로 옮긴다. 이름만 바꿀 수 있다. */
      readonly type: 'raw';
      readonly path: string;
      readonly raw: RawZipEntry;
    }
  | {
      /** 새 내용을 압축해 쓴다. */
      readonly type: 'file';
      readonly path: string;
      readonly data: Uint8Array<ArrayBuffer>;
      readonly modified?: Date;
      /**
       * 원본 파일의 속성(실행 권한 등)을 이어받을 때 원본 `ZipEntry`를 넘긴다. 없으면 일반 파일(0644)이다.
       * 속성의 뜻은 만든 운영체제(`versionMadeBy` 상위 바이트)에 따라 달라서 두 값을 함께 받는다.
       */
      readonly attributesFrom?: Pick<ZipEntry, 'externalAttributes' | 'versionMadeBy'>;
    }
  | {
      readonly type: 'directory';
      readonly path: string;
      readonly modified?: Date;
    };
