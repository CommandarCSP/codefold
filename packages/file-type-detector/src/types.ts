/** 텍스트 파일의 인코딩. `utf-8-bom`은 UTF-8 BOM이 붙은 파일이다. */
export type TextEncodingName = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'euc-kr';

/** 다시 쓸 수 있는 인코딩. 브라우저에 EUC-KR 인코더가 없어 `euc-kr`은 빠진다(ADR-0010). */
export type WritableTextEncoding = Exclude<TextEncodingName, 'euc-kr'>;

export type KindCategory = 'text' | 'image' | 'binary';

/** 어느 단계에서 판단했는지. */
export type DetectRule =
  'empty' | 'signature' | 'extension' | 'bom' | 'nul' | 'utf-8' | 'euc-kr' | 'undecodable';

/** 텍스트 크기 구분. Monaco가 기능을 끄는 기준(20MB, 50MB)에 맞춘다. */
export type TextSizeClass = 'normal' | 'large' | 'huge';

/** 확장자가 가리키는 종류와 판단 결과가 다를 때의 정보. */
export interface ExtensionConflict {
  readonly extension: string;
  readonly expected: KindCategory;
}

/** 판단 근거. 화면 안내와 테스트 검증에 쓴다. */
export interface DetectReason {
  readonly rule: DetectRule;
  /** `rule`이 `signature`일 때 일치한 서명 이름(예: `png`, `pdf`). */
  readonly signature?: string;
  readonly extensionConflict?: ExtensionConflict;
}

/** 텍스트로 읽을 때 필요한 정보. */
export interface TextInfo {
  readonly encoding: TextEncodingName;
  /** EUC-KR 추정 텍스트는 사용자가 UTF-8 변환을 고를 때까지 읽기 전용이다. */
  readonly readOnly: boolean;
  readonly sizeClass: TextSizeClass;
}

/** 파일 종류 판단 결과. 순수 객체라 Worker·IndexedDB를 오가도 깨지지 않는다(ADR-0017). */
export type FileKind =
  | ({ readonly kind: 'text'; readonly reason: DetectReason } & TextInfo)
  | {
      readonly kind: 'image';
      readonly mime: string;
      /** SVG처럼 텍스트이기도 한 이미지만 가진다. "코드로 보기"에서 이 인코딩으로 읽고 다시 쓴다. */
      readonly text?: TextInfo;
      readonly reason: DetectReason;
    }
  | { readonly kind: 'binary'; readonly reason: DetectReason };
