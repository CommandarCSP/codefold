# ADR-0031. 파일 종류 판단에서 이미지 확장자보다 내용을 믿고, 결과 타입을 구현에 맞춘다

- 상태: 승인 (판단 순서 3-1의 BOM 규칙은 ADR-0044로 일부 대체)
- 날짜: 2026-09-27
- 일부 대체: ADR-0010의 판단 순서 2(확장자)와 3-1(BOM), 결과 타입 `FileKind`, 패키지 폴더 구성

## 배경

`@codefold/file-type-detector`를 구현하면서 ADR-0010과 달라진 점이 생겼다.

- ADR-0010은 확장자가 이미지면 서명이 없어도 이미지로 판정한다. 그런데 이렇게 하면 이름만 `.png`인 텍스트 파일이 깨진 이미지로 보이고, 사용자는 그 내용을 읽을 수 없다. "확장자와 내용이 충돌하면 내용을 믿는다"는 ADR-0010의 원칙과도 어긋난다.
- ADR-0010의 BOM 검사는 UTF-16만 다룬다. 하지만 UTF-8 BOM도 원본에 있으면 다시 쓸 때 남겨야 한다.
- 결과 타입에 크기 구분과 SVG를 코드로 볼 때 쓸 인코딩이 없다.
- 앞 8KB만 보고 내린 판단은 파일 전체를 읽을 때 틀릴 수 있는데, 이때 패키지를 쓰는 쪽이 어떻게 처리할지 정해져 있지 않다.

## 결정

### 판단 순서

ADR-0010의 순서를 다음처럼 바꾼다. 먼저 걸리는 단계에서 끝나는 것은 같다.

0. 크기가 0이면 편집할 수 있는 UTF-8 텍스트다. 확장자가 이미지여도 같다.
1. **서명**: ADR-0010과 같다. 이미지 서명이면 이미지, 그 밖의 서명이면 바이너리다.
2. **확장자**: 알려진 **바이너리 확장자만** 여기서 바이너리로 끝낸다. 이미지 확장자는 서명이 맞지 않았으면 내용 검사로 넘긴다.
3. **내용 검사(앞 8KB)**
   1. BOM이 있으면 텍스트다. UTF-8 BOM(`EF BB BF`), UTF-16 LE(`FF FE`), UTF-16 BE(`FE FF`)를 모두 본다.
   2. NUL 바이트가 있으면 바이너리다.
   3. UTF-8로 엄격하게 읽히면 UTF-8 텍스트다.
   4. EUC-KR로 읽히고 한글 비율이 충분하면 EUC-KR 추정 텍스트다.
   5. 그 외는 바이너리다.
4. 확장자가 `.svg`이고 내용이 텍스트면 SVG 이미지다. 이때 결과에 텍스트 정보(인코딩)를 함께 담는다.

확장자가 가리키는 종류와 판단 결과가 다르면 결과의 `reason.extensionConflict`에 확장자와 예상 종류를 담는다. 이미지 확장자끼리 다른 것(`.jpg` 이름의 PNG)은 충돌로 보지 않는다.

### 오판을 줄이는 세부 규칙

- 글자로 된 짧은 서명은 뒤따르는 바이트까지 본다. BMP(`BM`)는 오프셋 6부터 4바이트가 0이어야 하고, MP3(`ID3`)는 버전 바이트가 2~4여야 한다.
- mp4·avif의 `ftyp` 서명은 앞 4바이트가 실제 상자 크기(8 이상 1KB 이하, 4의 배수)일 때만 인정한다. "The ftyp box…"로 시작하는 문장을 동영상으로 보지 않기 위해서다.
- EUC-KR은 한글 음절이 (한글 + 한자)의 절반 이상이고 제어 문자가 1% 미만일 때만 인정한다. Shift_JIS 같은 다른 인코딩을 EUC-KR로 읽으면 한자가 대부분이 되기 때문이다. 상자 선(━)과 ※ 같은 기호는 한국어 문서에도 많아 비율 계산에서 뺀다.

### 결과 타입

```ts
type TextEncodingName = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'euc-kr';

interface TextInfo {
  encoding: TextEncodingName;
  readOnly: boolean;                       // euc-kr일 때만 true
  sizeClass: 'normal' | 'large' | 'huge';  // 20MB 초과면 large, 50MB 초과면 huge
}

type FileKind =
  | ({ kind: 'text'; reason: DetectReason } & TextInfo)
  | { kind: 'image'; mime: string; text?: TextInfo; reason: DetectReason }  // text는 SVG만 가진다
  | { kind: 'binary'; reason: DetectReason };
```

UTF-8 BOM은 별도 `bom: boolean` 필드 대신 `utf-8-bom` 인코딩 값으로 나타낸다. UTF-16은 BOM이 있을 때만 UTF-16으로 판단하므로 BOM 여부가 인코딩에 이미 들어 있고, UTF-8도 같은 방식으로 두면 인코딩 값 하나로 읽기와 쓰기가 모두 정해진다.

### 전체를 읽을 때의 재확인

앞 8KB로 내린 판단을 전체 바이트로 다시 확인하는 일은 쓰는 쪽이 한다. 패키지는 그 방법을 제공한다.

- `decodeText(전체, encoding)`은 실패하면 `TextDecodeError`를 던진다. 코드는 두 가지다.
  - `binary-content`: 앞 8KB 뒤에서 NUL이 나왔다. 바이너리 보기로 바꾼다.
  - `invalid-encoding`: 그 인코딩으로 읽을 수 없다. 앞 8KB가 ASCII뿐이고 뒤에 EUC-KR 한글이 나오는 파일이 여기에 걸린다.
- `invalid-encoding`이면 `detectTextEncoding(전체)`로 인코딩을 다시 정한다. `undefined`가 나오면 바이너리로 본다.
- `encodeText(text, encoding)`은 원래 인코딩으로 다시 쓰고 BOM도 다시 붙인다. 브라우저에 EUC-KR 인코더가 없어 `encodeText`는 EUC-KR을 인자 타입에서부터 받지 않는다.

### 패키지 구성

패키지 이름과 폴더는 ADR-0023에 따라 `packages/file-type-detector`다. 인코딩별 읽기와 쓰기는 `decode.ts` 대신 `codec.ts` 한 파일에 둔다. 확장자만 보는 트리 아이콘용 판단은 `guessKindByExtension(name)`으로 내보낸다.

## 근거

- 이미지 확장자의 텍스트 파일을 텍스트로 열면 사용자는 내용을 읽을 수 있고, 충돌 안내로 이름이 이상하다는 것도 안다. 깨진 이미지로 보이면 둘 다 알 수 없다. 진짜 이미지는 서명 단계에서 이미 걸리므로 이 변경으로 놓치는 이미지는 없다.
- 바이너리 확장자(`.exe`, `.ttf`, `.docx` 등)를 확장자에서 끝내는 것은 그대로 둔다. 서명 표에 없는 바이너리 형식도 많고, 이런 파일을 텍스트로 잘못 열면 에디터에 깨진 글자가 가득 찬다.
- 판단 결과에 인코딩을 담아 두면 "코드로 보기"와 다운로드에서 같은 인코딩으로 읽고 쓸 수 있다. SVG가 UTF-16이어도 인코딩을 잃지 않는다.

## 결과

- 이름만 `.png`인 텍스트 파일은 텍스트로 열리고, "확장자는 .png지만 텍스트입니다" 같은 안내가 뜬다.
- 쓰는 쪽(react-code-editor)은 전체를 읽을 때 `TextDecodeError`의 두 코드를 처리해야 한다.
- 알려진 한계는 ADR-0010과 같다. BOM 없는 UTF-16은 바이너리로 판단한다.
