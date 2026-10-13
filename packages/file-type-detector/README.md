# @codefold/file-type-detector

파일을 열기 전에 **"이 파일을 에디터로 열까, 이미지로 보여 줄까, 열 수 없다고 안내할까"**를 정해 주는 패키지입니다. 텍스트 파일이면 글자를 어떤 방식으로 저장했는지(인코딩)도 알아내고, 고친 내용을 원래 방식 그대로 다시 저장하는 함수도 있습니다.

## 목차

- [왜 필요한가](#왜-필요한가)
- [먼저 알아 둘 개념](#먼저-알아-둘-개념)
- [한눈에 보는 사용 흐름](#한눈에-보는-사용-흐름)
- [판단은 이렇게 합니다](#판단은-이렇게-합니다)
- [결과 읽는 법](#결과-읽는-법)
- [상황별 결과](#상황별-결과)
- [쓰는 쪽이 꼭 처리해야 할 것](#쓰는-쪽이-꼭-처리해야-할-것)
- [API 레퍼런스](#api-레퍼런스)
- [잘못 판단하지 않도록 넣은 규칙](#잘못-판단하지-않도록-넣은-규칙)
- [알아보는 서명과 확장자](#알아보는-서명과-확장자)
- [한계](#한계)
- [테스트](#테스트)
- [관련 결정 기록](#관련-결정-기록)

## 왜 필요한가

사용자가 ZIP을 올리고 파일 목록에서 하나를 눌렀다고 해 봅시다. 화면은 파일마다 다르게 보여야 합니다.

- `App.tsx`, `README.md` → 코드 에디터로 열어 고칠 수 있게 합니다.
- `logo.png` → 이미지를 그대로 보여 줍니다.
- `font.woff2`, `setup.exe` → "편집할 수 없는 파일입니다"라고 안내합니다. 에디터로 열면 알아볼 수 없는 글자만 가득 찹니다.

가장 쉬운 방법은 확장자(파일 이름의 `.png` 부분)만 보는 것입니다. 하지만 확장자는 이름일 뿐이라 틀릴 수 있습니다. PNG 이미지의 이름을 `logo.txt`로 바꿔도 내용은 여전히 이미지입니다. `Makefile`처럼 확장자가 아예 없는 텍스트 파일도 많습니다.

그래서 이 패키지는 **파일 안의 내용(바이트)을 직접 들여다보고** 판단합니다. 다만 파일 전체를 읽으면 느리므로 **앞 8KB만** 봅니다. 8KB면 판단하기에 충분하고, 큰 바이너리 파일을 끝까지 압축 해제하지 않아도 됩니다.

이 패키지의 특징은 다음과 같습니다.

- 외부 라이브러리가 없습니다. 브라우저에 들어 있는 `TextDecoder`·`TextEncoder`만 씁니다.
- ZIP이나 Monaco 에디터와 상관없이 동작합니다. 바이트만 넘기면 어디서든 쓸 수 있습니다.
- 결과는 평범한 객체라서 Web Worker로 보내거나 IndexedDB에 저장해도 깨지지 않습니다.

## 먼저 알아 둘 개념

이 문서에 자주 나오는 용어를 먼저 풀어 둡니다. 인코딩을 처음 접한다면 이 절부터 읽으세요.

### 바이트

컴퓨터의 파일은 모두 0부터 255까지의 숫자가 늘어선 것입니다. 이 숫자 하나를 **바이트**라고 합니다. 이 문서에서는 바이트를 16진수로 적습니다. 예를 들어 `41`은 10진수 65이고, 텍스트에서는 영어 대문자 `A`를 뜻합니다.

### 텍스트 파일과 바이너리 파일

- **텍스트 파일**은 바이트를 정해진 규칙대로 글자로 바꾸면 사람이 읽을 수 있는 글이 되는 파일입니다. 소스 코드, 설정 파일, 문서가 여기에 들어갑니다.
- **바이너리 파일**은 글자로 읽으라고 만든 파일이 아닙니다. 이미지, 글꼴, 실행 파일, 압축 파일이 여기에 들어갑니다. 억지로 글자로 바꾸면 `�PNG␦␚...`처럼 깨진 글자가 나옵니다.

### 인코딩

바이트를 글자로 바꾸는 규칙을 **인코딩**이라고 합니다. 같은 글자 `가`도 인코딩에 따라 저장되는 바이트가 다릅니다.

| 인코딩 | 설명 | `가`를 저장한 바이트 |
|---|---|---|
| UTF-8 | 지금 가장 널리 쓰는 방식입니다. 영어는 1바이트, 한글은 3바이트로 저장합니다. | `EA B0 80` |
| UTF-16 | 글자 대부분을 2바이트로 저장합니다. 바이트 순서에 따라 LE와 BE 두 가지가 있습니다. | LE `00 AC`, BE `AC 00` |
| EUC-KR | 예전 Windows에서 쓰던 한국어 전용 방식입니다. 한글을 2바이트로 저장합니다. | `B0 A1` |

파일을 열 때 인코딩을 틀리게 고르면 한글이 엉뚱한 글자로 보입니다. 예를 들어 UTF-8로 저장한 `가`(`EA B0 80`)를 EUC-KR로 읽으면 `媛`로 시작하는 깨진 글자가 되고, 서유럽 문자용 옛 인코딩인 Latin-1로 읽으면 `ê°€`가 됩니다. 그래서 텍스트 파일도 **어떤 인코딩인지**까지 알아내야 제대로 열 수 있습니다.

### BOM

**BOM**(Byte Order Mark)은 파일 맨 앞에 붙어 그 파일의 인코딩을 나타내는 표식 바이트입니다. 모든 파일에 있지는 않습니다.

| BOM 바이트 | 뜻 |
|---|---|
| `EF BB BF` | UTF-8 (Windows 메모장이 이렇게 저장하곤 합니다) |
| `FF FE` | UTF-16 LE |
| `FE FF` | UTF-16 BE |

BOM이 있던 파일은 다시 저장할 때도 BOM을 붙여야 원래 파일과 같아집니다.

### NUL 바이트

값이 `00`인 바이트를 **NUL**이라고 합니다. 일반적인 텍스트에는 거의 나오지 않고, 이미지나 실행 파일 같은 바이너리에는 아주 흔합니다. 그래서 "NUL이 있으면 바이너리"라는 규칙이 잘 맞습니다. Git과 VS Code도 이 방법으로 바이너리를 가려냅니다.

예외가 하나 있습니다. UTF-16 LE는 영어 `A`를 `41 00`, UTF-16 BE는 `00 41`로 저장합니다. 어느 쪽이든 두 바이트 가운데 하나가 NUL이라, 텍스트인데도 NUL이 많습니다. 그래서 이 패키지는 NUL을 보기 전에 BOM부터 확인합니다.

### 서명(magic bytes)

이미지나 압축 파일 같은 형식은 파일 맨 앞에 **정해진 바이트**를 넣어 둡니다. 이것을 서명 또는 magic bytes라고 합니다. 이름이 틀려도 서명을 보면 진짜 형식을 알 수 있습니다.

| 형식 | 파일 맨 앞 바이트 | 글자로 보면 |
|---|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `‰PNG` + 제어 문자 |
| PDF | `25 50 44 46 2D` | `%PDF-` |
| ZIP | `50 4B 03 04` | `PK` + 제어 문자 |

### 헤드(head)

이 문서에서 **헤드**는 파일의 앞부분, 곧 판단에 쓰는 앞 8KB(8,192바이트)를 뜻합니다.

## 한눈에 보는 사용 흐름

파일 하나를 화면에 보여 주기까지 이 패키지의 함수를 네 번 씁니다.

```
① 목록을 나타낼 때  guessKindByExtension(이름)          → 아이콘을 정한다 (내용은 안 본다)
② 파일을 열 때      detectFileKind(이름, 앞 8KB, 크기)  → 텍스트 / 이미지 / 바이너리
③ 텍스트를 읽을 때  decodeText(전체 바이트, 인코딩)      → 문자열
④ 다시 저장할 때    encodeText(고친 문자열, 인코딩)      → 원래 인코딩의 바이트
```

### 한 단계씩 따라 하기

파일 하나를 열고 다시 저장하기까지를 순서대로 적으면 다음과 같습니다.

1. `readHead(path, HEAD_SIZE)`로 앞부분을 가져와 `detectFileKind`를 부릅니다. `totalSize`에는 실제 파일 크기를 넘깁니다.
2. 결과가 `binary`면 여기서 멈춥니다. 파일의 나머지 부분은 압축을 풀지 않아도 됩니다.
3. 텍스트나 이미지면 파일 전체를 읽습니다.
4. `image`면 `mime`으로 `Blob`을 만들어 보여 줍니다. SVG면 `text` 필드를 저장해 둡니다. SVG를 이미지 대신 코드로 여는 "코드로 보기"에서 씁니다.
5. `text`면 아래 [readText](#1-전체를-읽다-실패하면-다시-판단합니다)로 읽습니다. 읽지 못하면 바이너리 안내로 바꿉니다.
6. 실제로 읽은 인코딩으로 `TextInfo`를 만들어 저장합니다. 인코딩이 `'euc-kr'`이면 읽기 전용으로 엽니다.
7. 다운로드할 때는 저장해 둔 인코딩을 `encodeText`에 넘깁니다. `'euc-kr'`은 다시 저장할 수 없으므로, 사용자가 UTF-8로 바꾼 뒤 `'utf-8'`로 넘깁니다.

코드로 쓰면 다음과 같습니다.

```ts
import {
  HEAD_SIZE,
  detectFileKind,
  encodeText,
  guessKindByExtension,
  type TextInfo,
  type WritableTextEncoding,
} from '@codefold/file-type-detector';

// ① 목록을 나타낼 때: 압축을 풀지 않고 이름만으로 아이콘을 정한다.
//    react-code-editor의 파일 트리가 이 결과로 아이콘을 고른다.
guessKindByExtension('src/logo.png'); // 'image'

// ② 파일을 열 때: 앞 8KB만 가져와 종류를 판단한다.
//    앞부분을 가져오는 방법(ZIP 압축 해제 등)은 쓰는 쪽이 정한다.
//    totalSize는 꼭 실제 파일 크기여야 한다.
const head = await readHead(path, HEAD_SIZE);
const kind = detectFileKind(path, head, totalSize);

// ③에서 실제로 읽은 인코딩을 저장해 둔다. ④에서 쓴다.
let info: TextInfo | undefined;

if (kind.kind === 'binary') {
  showBinaryNotice(kind.reason); // 나머지는 압축을 풀지 않아도 된다
} else if (kind.kind === 'image') {
  showImage(await readAll(path), kind.mime);
  info = kind.text; // SVG일 때만 값이 있다. "코드로 보기"로 읽고 쓸 때 쓴다
} else {
  // ③ 텍스트면 전체를 가져와 문자열로 읽는다.
  //    readText는 "쓰는 쪽이 꼭 처리해야 할 것"의 1번에 있다.
  const read = readText(await readAll(path), kind.encoding);
  if (read === undefined) {
    showBinaryNotice(); // 전체를 읽어 보니 텍스트가 아니었다
  } else {
    // 인코딩을 다시 판단했으면 kind.encoding과 다를 수 있으므로 read.encoding을 쓴다.
    info = {
      encoding: read.encoding,
      readOnly: read.encoding === 'euc-kr',
      sizeClass: kind.sizeClass,
    };
    openEditor(read.text, { readOnly: info.readOnly });
  }
}

// ④ 다운로드할 때: 고친 문자열을 원래 인코딩으로 되돌린다. BOM도 다시 붙는다.
//    EUC-KR은 다시 저장할 수 없어서, 사용자가 UTF-8로 바꾼 뒤 'utf-8'로 저장한다.
if (info) {
  const encoding: WritableTextEncoding = info.encoding === 'euc-kr' ? 'utf-8' : info.encoding;
  const bytes = encodeText(editedText, encoding);
}
```

`readHead`, `readAll`, `showImage`, `showBinaryNotice`, `openEditor` 같은 함수는 예시일 뿐이고 이 패키지에 없습니다. 쓰는 쪽이 만듭니다.

저장할 때 `detectFileKind`의 결과(`kind.encoding`)를 그대로 넘기면 안 됩니다. ③에서 인코딩을 다시 판단했다면 그 값은 실제로 읽은 인코딩과 다를 수 있습니다. 또 `kind.kind`를 확인하기 전에는 TypeScript가 `kind`를 텍스트 결과로 보지 않으므로, `kind.encoding`이라고 쓰면 오류가 납니다.

## 판단은 이렇게 합니다

`detectFileKind`는 아래 질문을 **위에서부터 차례로** 던지고, 처음으로 "예"가 나온 곳에서 답을 정합니다.

| 순서 | 질문 | "예"면 | 예시 |
|---|---|---|---|
| 0 | 파일 크기가 0인가? | 빈 텍스트 파일 | 방금 만든 빈 파일 |
| 1 | 맨 앞 바이트가 알려진 서명과 같은가? | 이미지 서명이면 **이미지**, 그 밖이면 **바이너리** | PNG, PDF, ZIP |
| 2 | 확장자가 알려진 바이너리 확장자인가? | **바이너리** | `.exe`, `.ttf`, `.docx` |
| 3 | 맨 앞에 BOM이 있는가? | 그 인코딩으로 읽히면 그 인코딩의 **텍스트**, 읽히지 않으면 **바이너리** | 메모장에서 저장한 파일 |
| 4 | NUL 바이트가 있는가? | **바이너리** | 서명 없는 실행 파일 조각 |
| 5 | UTF-8 규칙에 맞는가? | UTF-8 **텍스트** | 대부분의 소스 코드 |
| 6 | EUC-KR로 읽으면 한국어 글처럼 보이는가? | EUC-KR **텍스트** (읽기 전용) | 옛날 한글 문서 |
| 7 | 여기까지 모두 "아니요" | **바이너리** | 알 수 없는 형식 |

마지막으로, 확장자가 `.svg`이고 3~6번에서 텍스트로 나왔다면 **SVG 이미지**로 정합니다. SVG는 글자로 쓴 이미지라서 이미지로도, 코드로도 볼 수 있습니다.

### 순서를 이렇게 정한 이유

**서명을 확장자보다 먼저 봅니다.** 서명은 텍스트에 나올 일이 거의 없는 바이트로 만들어져 가장 믿을 만합니다. 이름이 `logo.txt`여도 내용이 PNG면 이미지로 보여 줍니다.

**이미지 확장자는 믿지 않습니다.** 진짜 이미지라면 1번에서 이미 서명이 맞습니다. 서명이 없는데 이름만 `.png`라면 이름이 틀린 것이므로 내용으로 판단합니다. 내용이 텍스트면 텍스트로 열어 사용자가 읽을 수 있게 합니다.

**바이너리 확장자는 믿습니다.** 세상의 바이너리 형식은 서명 표에 다 넣을 수 없을 만큼 많습니다. `.exe`나 `.docx`를 내용 검사에 맡기면 드물게 텍스트로 잘못 열 수 있어, 확장자를 보고 바로 끝냅니다.

**BOM을 NUL보다 먼저 봅니다.** UTF-16 텍스트는 NUL이 많아서, 순서가 반대면 바이너리로 잘못 판단합니다. 대신 BOM만 믿지는 않고, 그 인코딩으로 실제로 읽히는지 확인합니다. 자세한 내용은 [BOM만 보고 믿지 않기](#bom만-보고-믿지-않기)에 있습니다.

**UTF-8을 EUC-KR보다 먼저 봅니다.** UTF-8은 규칙이 엄격해서 우연히 맞을 일이 거의 없습니다. 무작위 바이트 수백 개가 올바른 UTF-8이 될 확률은 사실상 0입니다. 그래서 UTF-8 규칙에 맞으면 믿고 텍스트로 봅니다. EUC-KR은 규칙이 느슨해서 추정만 할 수 있으므로 뒤에 둡니다.

### 확장자와 내용이 다를 때

확장자가 바이너리 확장자가 **아니면**, 확장자보다 내용을 따라 판단합니다. 대신 결과에 "확장자는 무엇을 가리켰는지"를 함께 담아, 화면에서 "확장자는 .txt지만 PNG 이미지입니다"처럼 알릴 수 있게 합니다. 이 정보는 결과가 바이너리일 때도 붙습니다. `.jpg` 이름의 PNG처럼 이미지끼리 다른 경우는 알리지 않습니다. 어차피 이미지로 잘 보이기 때문입니다.

다음 결과에는 확장자 충돌 정보(`extensionConflict`)가 붙지 않습니다.

- **바이너리 확장자로 끝난 결과**(`rule: 'extension'`): 내용이 텍스트라도 확장자가 `.docx`면 바이너리로 보고, 내용은 보지 않습니다.
- **빈 파일**(`rule: 'empty'`): 이름이 `blank.png`여도 충돌로 보지 않습니다.
- **SVG 이미지 결과**: 확장자 `.svg`와 판단이 서로 맞기 때문입니다.

## 결과 읽는 법

`detectFileKind`는 `FileKind` 객체를 돌려줍니다. `kind` 필드를 먼저 보면 나머지 필드가 정해집니다.

```ts
// 텍스트 → 에디터로 연다
{ kind: 'text', encoding: 'utf-8', readOnly: false, sizeClass: 'normal', reason: { rule: 'utf-8' } }

// 이미지 → 그대로 보여 준다
{ kind: 'image', mime: 'image/png', reason: { rule: 'signature', signature: 'png' } }

// SVG 이미지 → 이미지로 보여 주되, 코드로 볼 때 쓸 인코딩도 담는다
{ kind: 'image', mime: 'image/svg+xml',
  text: { encoding: 'utf-8', readOnly: false, sizeClass: 'normal' }, reason: { rule: 'utf-8' } }

// 바이너리 → 열 수 없다고 안내한다
{ kind: 'binary', reason: { rule: 'nul' } }
```

### 텍스트 결과의 필드

`kind: 'text'` 결과에는 아래 세 필드가 바로 있고, SVG 이미지 결과에는 `text` 필드 안에 있습니다.

| 필드 | 값 | 설명 |
|---|---|---|
| `encoding` | `'utf-8'`, `'utf-8-bom'`, `'utf-16le'`, `'utf-16be'`, `'euc-kr'` | 파일의 인코딩입니다. `decodeText`와 `encodeText`에 그대로 넘깁니다. `'utf-8-bom'`은 BOM이 붙은 UTF-8입니다. |
| `readOnly` | `true` / `false` | `true`면 편집을 막아야 합니다. EUC-KR일 때만 `true`입니다. 이유는 [EUC-KR은 읽기 전용으로 엽니다](#2-euc-kr은-읽기-전용으로-엽니다)에 있습니다. |
| `sizeClass` | `'normal'`, `'large'`, `'huge'` | 파일 크기 구분입니다. 20MB(`LARGE_TEXT_BYTES`)보다 크면 `'large'`, 50MB(`HUGE_TEXT_BYTES`)보다 크면 `'huge'`입니다. 정확한 값은 [상수](#상수)에 있습니다. 큰 파일에서 Monaco가 일부 기능을 끄므로 미리 안내할 때 씁니다. |

### 이미지 결과의 필드

`kind: 'image'` 결과에 붙는 필드입니다.

| 필드 | 설명 |
|---|---|
| `mime` | 이미지 형식입니다. `'image/png'`, `'image/svg+xml'` 등이고, `Blob`을 만들 때 씁니다. |
| `text` | SVG에만 있습니다. "코드로 보기"로 바꿀 때 `text.encoding`으로 읽고 다시 씁니다. |

### 판단 근거 `reason`

모든 결과에 있습니다. "왜 이렇게 판단했는지"를 담으며, 화면 안내와 디버깅에 씁니다.

| 필드 | 설명 |
|---|---|
| `rule` | 몇 번째 질문에서 답이 났는지입니다. 아래 표를 보세요. |
| `signature` | 서명으로 판단했을 때 맞은 서명 이름입니다. `'png'`, `'pdf'` 등. |
| `extensionConflict` | 확장자와 내용이 다를 때만 있습니다. 예: `{ extension: 'txt', expected: 'text' }`는 "확장자 `.txt`는 텍스트를 가리켰다"는 뜻입니다. |

| `rule` 값 | 뜻 | 나오는 결과 |
|---|---|---|
| `'empty'` | 0바이트 파일 | 텍스트 |
| `'signature'` | 서명이 맞음 | 이미지, 바이너리 |
| `'extension'` | 알려진 바이너리 확장자 | 바이너리 |
| `'bom'` | BOM이 있고 그 인코딩으로 읽힘 | 텍스트, SVG |
| `'nul'` | NUL 바이트가 있음 | 바이너리 |
| `'utf-8'` | UTF-8 규칙에 맞음 | 텍스트, SVG |
| `'euc-kr'` | EUC-KR 한국어로 추정 | 텍스트, SVG |
| `'undecodable'` | 어떤 인코딩으로도 읽히지 않음. BOM은 있는데 그 인코딩으로 읽히지 않을 때도 이 값입니다. | 바이너리 |

## 상황별 결과

흔히 만나는 파일마다 어떤 결과가 나오는지 모았습니다.

| 상황 | 결과 |
|---|---|
| `app.ts` (UTF-8, 한글 주석 포함) | 텍스트, `utf-8` |
| 메모장에서 저장한 `a.txt` (BOM 있는 UTF-8) | 텍스트, `utf-8-bom`. 다시 저장할 때 BOM을 붙입니다. |
| `data.csv` (BOM 있는 UTF-16 LE) | 텍스트, `utf-16le` |
| 옛날에 만든 `공지.txt` (EUC-KR) | 텍스트, `euc-kr`, 읽기 전용 |
| `Makefile` (확장자 없음) | 텍스트, `utf-8` |
| 빈 파일 (이름이 `.png`여도) | 텍스트, `utf-8`, `rule: 'empty'` |
| 30MB 로그 파일 | 텍스트, `sizeClass: 'large'` |
| `logo.png` | 이미지, `image/png` |
| 이름은 `logo.jpg`, 내용은 PNG | 이미지, `image/png`. 이미지끼리라 확장자 충돌로 보지 않습니다. |
| 이름은 `logo.txt`, 내용은 PNG | 이미지, `image/png`, 확장자 충돌 `{ extension: 'txt', expected: 'text' }` |
| 이름은 `logo.png`, 내용은 텍스트 | 텍스트, 확장자 충돌 `{ extension: 'png', expected: 'image' }` |
| `icon.svg` | 이미지, `image/svg+xml`, `text` 필드 있음 |
| 이름은 `icon.svg`, 내용은 텍스트가 아님 | 바이너리, 확장자 충돌 `{ extension: 'svg', expected: 'image' }` |
| 이름은 `notes.txt`, 내용은 어떤 인코딩으로도 읽히지 않는 바이트 | 바이너리, `rule: 'undecodable'`, 확장자 충돌 `{ extension: 'txt', expected: 'text' }` |
| `doc.pdf`, `font.woff2`, `a.zip` | 바이너리, `rule: 'signature'` |
| `setup.exe` | 바이너리, `rule: 'extension'` |
| 확장자를 모르는 바이너리 | 바이너리, `rule: 'nul'` 또는 `'undecodable'` |
| BOM은 있는데 그 인코딩으로 읽히지 않음 | 바이너리, `rule: 'undecodable'` ([BOM만 보고 믿지 않기](#bom만-보고-믿지-않기)) |
| 앞 8KB는 텍스트인데 뒤에 NUL이 있음 | 처음엔 텍스트로 판단합니다. 전체를 읽을 때 오류가 납니다. ([처리 방법](#1-전체를-읽다-실패하면-다시-판단합니다)) |
| 앞 8KB는 영어뿐이고 뒤에 EUC-KR 한글이 있음 | 처음엔 `utf-8`로 판단합니다. 전체를 읽을 때 오류가 납니다. ([처리 방법](#1-전체를-읽다-실패하면-다시-판단합니다)) |

## 쓰는 쪽이 꼭 처리해야 할 것

이 패키지는 판단만 하고 화면은 그리지 않습니다. 아래 일은 이 패키지를 쓰는 쪽이 맡아야 합니다.

### 1. 전체를 읽다 실패하면 다시 판단합니다

`detectFileKind`는 앞 8KB만 보고 판단하므로, 파일 전체를 읽을 때 판단이 틀렸다는 것이 드러날 수 있습니다. 두 가지 경우가 있습니다.

- **앞은 텍스트인데 뒤에 바이너리가 섞인 파일.** 앞 8KB에는 NUL이 없어 텍스트로 판단했지만, 뒤에서 NUL이 나옵니다.
- **앞은 영어뿐이고 뒤에 EUC-KR 한글이 나오는 파일.** 영어(ASCII)는 UTF-8과 EUC-KR에서 바이트가 똑같아서, 앞 8KB만 보면 UTF-8과 구분되지 않습니다. 그래서 UTF-8로 판단했는데, 뒤의 EUC-KR 한글은 UTF-8 규칙에 맞지 않습니다.

이때 `decodeText`가 `TextDecodeError`를 던지고, 오류의 `code`로 두 경우를 구분할 수 있습니다.

```ts
import {
  decodeText,
  detectTextEncoding,
  TextDecodeError,
  type TextEncodingName,
} from '@codefold/file-type-detector';

function readText(bytes: Uint8Array, encoding: TextEncodingName) {
  try {
    return { text: decodeText(bytes, encoding), encoding };
  } catch (error) {
    if (!(error instanceof TextDecodeError)) throw error;

    // 뒤에 바이너리가 섞여 있었다 → 바이너리 안내로 바꾼다
    if (error.code === 'binary-content') return undefined;

    // 인코딩이 틀렸다 → 파일 전체로 인코딩을 다시 판단한다
    const again = detectTextEncoding(bytes);
    if (again === undefined) return undefined; // 전체를 봐도 텍스트가 아니다 → 바이너리 안내
    try {
      return { text: decodeText(bytes, again), encoding: again };
    } catch {
      return undefined; // 다시 판단한 인코딩으로도 읽을 수 없다 → 바이너리 안내
    }
  }
}
```

BOM이 있는 파일도 같은 방법으로 처리됩니다. 예를 들어 앞 8KB는 올바른 UTF-16인데 전체 바이트 수가 홀수인 파일은 처음에 `utf-16le`로 판단합니다. 전체를 읽으면 `invalid-encoding`이 나고, `detectTextEncoding`은 전체가 UTF-16으로 읽히지 않으므로 `undefined`를 돌려줍니다. 그래서 바이너리 안내로 바뀝니다.

두 번째 `decodeText`도 `try`로 감쌉니다. `detectTextEncoding`은 BOM이 있으면 NUL 검사를 하지 않습니다. 그래서 인코딩을 돌려받아도 `decodeText`가 `binary-content`로 실패할 수 있습니다. 위처럼 `detectFileKind`가 정한 인코딩으로 먼저 읽다가 `invalid-encoding`이 난 경우에는 이런 일이 생기지 않습니다. 그래도 `detectTextEncoding`을 다른 곳에서 부를 때 이 모양을 그대로 쓸 수 있게 감싸 둡니다.

다시 판단한 결과가 `'euc-kr'`이면 읽기 전용으로 열어야 합니다. `detectTextEncoding`은 인코딩만 돌려주고 `readOnly` 값은 돌려주지 않으므로, 쓰는 쪽이 `encoding === 'euc-kr'`로 새로 정합니다.

**SVG도 같습니다.** SVG를 "코드로 보기"로 열 때 `decodeText(전체, kind.text.encoding)`은 같은 오류를 던질 수 있습니다. 앞 8KB 뒤에 NUL이 있는 SVG는 `detectFileKind`에서 이미지로 나오지만, 전체를 읽으면 `binary-content`로 실패합니다. SVG도 위 `readText`로 읽고, 실패하면 "코드로 보기"를 막거나 읽을 수 없다고 알리세요.

### 2. EUC-KR은 읽기 전용으로 엽니다

브라우저는 EUC-KR 파일을 **읽을** 수는 있지만 EUC-KR로 **저장할** 방법이 없습니다. 브라우저의 `TextEncoder`는 UTF-8로만 저장합니다.

그래서 EUC-KR 파일을 그냥 편집하게 하면, 다운로드할 때 사용자도 모르게 UTF-8로 바뀝니다. 이를 막으려고 결과에 `readOnly: true`를 담습니다. 쓰는 쪽은 편집을 막고, "UTF-8로 바꿔 편집" 같은 버튼을 보여 주세요. 사용자가 누르면 그때부터 `'utf-8'`로 다룹니다.

### 3. 확장자와 내용이 다르면 알립니다

`reason.extensionConflict`가 있으면 "확장자는 .txt지만 PNG 이미지입니다"처럼 화면에 알려 주세요. 사용자는 이름이 잘못 붙은 파일이라는 것을 알 수 있습니다.

### 4. 큰 파일 안내는 참고로만 씁니다

`sizeClass`는 바이트 수만 보고 미리 어림한 값입니다. Monaco는 바이트가 아니라 **글자 수**와 **줄 수**로 기능을 끄기 때문에 결과가 다를 수 있습니다.

- 한글이 대부분인 30MB UTF-8 파일은 글자 수가 약 1,000만 자입니다. `sizeClass`는 `'large'`지만 Monaco는 기능을 끄지 않습니다.
- 5MB인데 40만 줄인 로그 파일은 `sizeClass`가 `'normal'`입니다. 하지만 Monaco는 30만 줄을 넘으면 구문 강조를 끕니다.

그래서 안내를 띄울지는 Monaco의 model(에디터가 다루는 문서 객체)을 만든 뒤 Monaco의 판단 함수로 최종 확인하세요. `'large'`는 `model.isTooLargeForTokenization()`, `'huge'`는 `model.isTooLargeForSyncing()`으로 확인합니다. 두 함수는 Monaco의 공개 타입에 없으므로, 있으면 부르고 없으면 `sizeClass`로 대신하세요. 예시는 react-code-editor의 [`src/views/format.ts`](../react-code-editor/src/views/format.ts)에 있습니다.

### 5. SVG는 `<img>`로만 그립니다

SVG는 글자로 쓴 파일이라 안에 스크립트를 넣을 수 있습니다. HTML에 직접 끼워 넣으면 그 스크립트가 실행될 수 있으니, `Blob` URL을 만들어 `<img src={url}>`로 그리세요. `<img>`로 그린 SVG는 스크립트가 실행되지 않습니다.

## API 레퍼런스

공개 함수는 다섯 개입니다. 이 밖에 오류 클래스 하나(`TextDecodeError`), 상수 셋, 타입 아홉 개를 내보냅니다. 함수는 파일을 다루는 순서대로 적었습니다.

| 함수 | 쓰는 시점 | 돌려주는 값 |
|---|---|---|
| `guessKindByExtension(name)` | 파일 트리에 아이콘을 나타낼 때 | `'text'`, `'image'`, `'binary'` 가운데 하나 |
| `detectFileKind(name, head, totalSize)` | 파일을 열 때 | `FileKind` |
| `decodeText(bytes, encoding)` | 텍스트 파일 전체를 읽을 때 | `string` |
| `detectTextEncoding(bytes)` | 전체를 읽다 인코딩 오류가 났을 때 | 인코딩 이름 또는 `undefined` |
| `encodeText(text, encoding)` | 고친 텍스트를 다시 저장할 때 | `Uint8Array` |

### `guessKindByExtension(name: string): KindCategory`

이름의 확장자만 보고 종류를 짐작합니다. 파일 내용은 보지 않으므로 틀릴 수 있습니다. react-code-editor의 파일 트리는 이 결과로 텍스트·이미지·바이너리 아이콘(`FileText`, `FileImage`, `FileArchive`)을 고릅니다([`src/tree/tree-row.tsx`](../react-code-editor/src/tree/tree-row.tsx)). 목록 아이콘처럼 틀려도 문제없는 곳에만 쓰고, 파일을 열 때는 `detectFileKind`를 쓰세요. 모르는 확장자와 확장자가 없는 이름(`Makefile`)은 `'text'`로 봅니다.

### `detectFileKind(name: string, head: Uint8Array, totalSize: number): FileKind`

이 패키지의 핵심 함수입니다. 판단 순서는 [판단은 이렇게 합니다](#판단은-이렇게-합니다)에 있습니다.

| 인자 | 설명 |
|---|---|
| `name` | 파일 이름이나 경로입니다. 확장자만 쓰고, 대소문자는 가리지 않습니다. 경로는 `/`로 나눕니다. `\`로 나눈 경로는 먼저 `/`로 바꿔 넘기세요. |
| `head` | 파일 앞부분입니다. `HEAD_SIZE`(8,192바이트)만큼 넘기면 됩니다. 더 길게 넘겨도 앞 8KB만 봅니다. 파일이 8KB보다 작으면 전체를 넘기면 됩니다. 파일이 비어 있지 않으면 `head`도 비우지 마세요. 빈 `head`는 내용 없이 판단하므로 텍스트로 나오고, 그 결과는 믿을 수 없습니다. |
| `totalSize` | 파일 전체 크기(바이트)입니다. `sizeClass`를 정할 때 씁니다. `head`가 이보다 짧으면 "뒤가 더 있는 앞부분"으로 보고, 끝에서 잘린 글자를 오류로 치지 않습니다. |

`totalSize`는 꼭 실제 파일 크기여야 합니다. 크기를 모른다고 `head.length`를 넘기면 `detectFileKind`는 "뒤가 더 없다"고 봅니다. 그러면 8KB 끝에서 잘린 한글을 오류로 쳐서, 멀쩡한 UTF-8 파일이 바이너리로 판단됩니다.

```ts
const bytes = new TextEncoder().encode('a'.repeat(8190) + '한글'); // 8,196바이트
const head = bytes.subarray(0, HEAD_SIZE); // '한'의 가운데에서 잘린다

detectFileKind('a.txt', head, bytes.length); // 텍스트, 'utf-8'
detectFileKind('a.txt', head, head.length); // 바이너리, rule: 'undecodable'
```

어떤 바이트를 넘겨도 예외를 던지지 않고 항상 결과를 돌려줍니다.

### `decodeText(bytes: Uint8Array, encoding: TextEncodingName): string`

바이트를 인코딩에 맞춰 문자열로 바꿉니다. BOM은 결과 문자열에 넣지 않습니다. 바꿀 수 없으면 `TextDecodeError`를 던집니다.

### `detectTextEncoding(bytes: Uint8Array): TextEncodingName | undefined`

**파일 전체 바이트**로 인코딩을 다시 판단합니다. 텍스트가 아니면 `undefined`를 돌려줍니다. 앞 8KB만 보는 `detectFileKind`와 달리 전체를 훑으므로 더 느립니다. `decodeText`가 `'invalid-encoding'` 오류를 던졌을 때만 쓰세요.

판단 순서는 `detectFileKind`의 3~7번과 같습니다. 파일이 BOM으로 시작해도 전체가 그 인코딩으로 읽히는지 확인하고, 읽히지 않으면 `undefined`를 돌려줍니다. 다만 BOM이 있으면 NUL 검사는 하지 않으므로, 돌려받은 인코딩으로 `decodeText`를 부를 때도 `binary-content` 오류에 대비하세요([예시](#1-전체를-읽다-실패하면-다시-판단합니다)).

### `encodeText(text: string, encoding: WritableTextEncoding): Uint8Array`

문자열을 원래 인코딩의 바이트로 되돌립니다.

| 인코딩 | 결과 |
|---|---|
| `'utf-8'` | UTF-8, BOM 없음 |
| `'utf-8-bom'` | 앞에 `EF BB BF`를 붙인 UTF-8 |
| `'utf-16le'` | 앞에 `FF FE`를 붙인 UTF-16 LE |
| `'utf-16be'` | 앞에 `FE FF`를 붙인 UTF-16 BE |

`'euc-kr'`은 받지 않으며, 넘기면 TypeScript가 타입 오류를 냅니다. 브라우저에 EUC-KR로 저장하는 기능이 없기 때문입니다. EUC-KR 파일은 사용자가 UTF-8로 바꾸기로 한 뒤 `'utf-8'`로 저장합니다.

**짝 없는 서로게이트는 U+FFFD(`�`)로 바꿉니다.** 자바스크립트 문자열은 이모지 같은 글자를 코드 단위 두 개로 나누어 담습니다. 이 두 조각을 서로게이트라고 합니다. 편집하다 한쪽만 남으면 올바른 글자가 아니므로, 그대로 쓰면 `decodeText`가 다시 읽지 못합니다. 그래서 UTF-16으로 쓸 때는 짝 없는 조각을 `�`로 바꿉니다. UTF-8로 쓸 때는 브라우저의 `TextEncoder`가 같은 일을 합니다. 예를 들어 `encodeText('a\ud800b', 'utf-16le')`를 다시 읽으면 `'a�b'`입니다.

### `TextDecodeError`

`decodeText`가 던지는 오류입니다. `Error`를 상속합니다.

| 속성 | 값 |
|---|---|
| `name` | `'TextDecodeError'` |
| `code` | `'binary-content'`: 읽은 결과에 NUL 문자가 있습니다. 뒤쪽에 바이너리가 섞인 파일입니다. <br>`'invalid-encoding'`: 그 인코딩 규칙에 맞지 않는 바이트가 있습니다. 인코딩을 잘못 골랐다는 뜻입니다. |
| `encoding` | 읽으려던 인코딩 |

### 상수

판단에 쓰는 크기 기준 셋을 상수로 내보냅니다.

| 이름 | 값 | 뜻 |
|---|---|---|
| `HEAD_SIZE` | `8192` | 판단에 쓰는 최대 바이트 수입니다. 파일을 열 때 이만큼만 가져오면 됩니다. |
| `LARGE_TEXT_BYTES` | `20 * 1024 * 1024` (20,971,520) | 이보다 크면 `sizeClass`가 `'large'`입니다. 정확히 이 값이면 `'normal'`입니다. Monaco가 구문 강조와 코드 접기를 끄는 기준(20MB)입니다. |
| `HUGE_TEXT_BYTES` | `50 * 1024 * 1024` (52,428,800) | 이보다 크면 `sizeClass`가 `'huge'`입니다. Monaco가 model을 언어 worker(자동 완성·오류 검사를 따로 맡는 백그라운드 스레드)로 보내지 않는 기준(50MB)입니다. 그래서 worker가 맡는 자동 완성과 오류 표시가 꺼집니다. |

Monaco의 기준은 바이트가 아니라 글자 수라서, 두 값은 어림값입니다. 자세한 내용은 [큰 파일 안내는 참고로만 씁니다](#4-큰-파일-안내는-참고로만-씁니다)에 있습니다.

### 타입

모두 `import type`으로 가져다 씁니다.

| 이름 | 모양 | 쓰는 곳 |
|---|---|---|
| `FileKind` | `kind`가 `'text'`, `'image'`, `'binary'`인 세 모양 가운데 하나 | `detectFileKind`의 결과입니다. [결과 읽는 법](#결과-읽는-법)에 필드가 있습니다. |
| `TextInfo` | `{ encoding, readOnly, sizeClass }` | 텍스트로 읽을 때 필요한 세 필드입니다. 텍스트 결과와 SVG의 `text`가 이 모양입니다. 인코딩을 다시 판단했으면 쓰는 쪽이 이 모양으로 새로 만듭니다. |
| `TextEncodingName` | `'utf-8'`, `'utf-8-bom'`, `'utf-16le'`, `'utf-16be'`, `'euc-kr'` | 인코딩 이름입니다. `decodeText`에 넘깁니다. |
| `WritableTextEncoding` | `TextEncodingName`에서 `'euc-kr'`을 뺀 것 | `encodeText`에 넘기는 인코딩입니다. |
| `KindCategory` | `'text'`, `'image'`, `'binary'` | `guessKindByExtension`의 결과와 `ExtensionConflict.expected`입니다. |
| `TextSizeClass` | `'normal'`, `'large'`, `'huge'` | `TextInfo.sizeClass`입니다. |
| `DetectReason` | `{ rule, signature?, extensionConflict? }` | 모든 결과의 `reason`입니다. |
| `DetectRule` | `'empty'`, `'signature'`, `'extension'`, `'bom'`, `'nul'`, `'utf-8'`, `'euc-kr'`, `'undecodable'` | `DetectReason.rule`입니다. |
| `ExtensionConflict` | `{ extension, expected }` | 확장자와 판단이 다를 때의 정보입니다. `extension`은 점을 뺀 소문자 확장자(`'txt'`)입니다. |

## 잘못 판단하지 않도록 넣은 규칙

간단한 규칙만으로는 잘못 판단하는 파일이 생깁니다. 테스트하면서 찾은 경우와 막는 방법을 모았습니다.

### 8KB 끝에서 잘린 한글

UTF-8 한글은 3바이트라서, 8KB 경계가 한글 한 글자의 가운데를 자를 수 있습니다. 그러면 마지막 글자가 1~2바이트만 남아 UTF-8 규칙에 어긋난 것처럼 보입니다.

그래서 `head`가 파일 전체보다 짧으면 "뒤가 더 있다"고 보고, 끝에서 잘린 글자를 오류로 치지 않습니다. 반대로 `head`가 파일 전체인데 끝 글자가 잘려 있으면 정말로 잘못된 파일이므로 UTF-8로 보지 않습니다.

EUC-KR 한글(2바이트)도 같습니다. 8KB 경계에서 한 글자의 첫 바이트만 남아도 오류로 치지 않습니다.

### 글자로 된 짧은 서명

어떤 서명은 평범한 영어 글자로 되어 있습니다. BMP 이미지는 `BM`, MP3는 `ID3`, ZIP은 `PK`로 시작합니다. 앞 두세 글자만 비교하면 `BMW is a car brand`로 시작하는 텍스트를 BMP 이미지로 잘못 봅니다.

그래서 서명 뒤에 오는 바이트까지 함께 확인합니다. 진짜 파일이라면 그 자리에 글자가 아닌 제어 바이트가 옵니다.

| 서명 | 추가로 확인하는 것 | 이 확인으로 막는 오판 |
|---|---|---|
| BMP `BM` | 7~10번째 바이트가 모두 `00` | `BMW is a car brand` |
| MP3 `ID3` | 4번째 바이트가 버전 번호(2~4)이고 5번째가 `00` | `ID3 tags are metadata` |
| ZIP `PK` | 3~4번째 바이트가 `03 04`, `05 06`, `07 08` 가운데 하나 | `PK stands for primary key` |
| WebP·WAV `RIFF` | 9~12번째 바이트가 `WEBP`나 `WAVE` | `RIFF raff` |
| mp4·avif `ftyp` | 1~4번째 바이트가 그럴듯한 크기 값(8 이상 1,024 이하, 4의 배수) | `The ftyp box describes…` |

### BOM만 보고 믿지 않기

바이너리 파일도 우연히 `FF FE`나 `FE FF`로 시작할 수 있습니다. 그래서 BOM이 있으면 그 인코딩으로 실제로 읽어 봅니다. `detectFileKind`는 앞 8KB를, `detectTextEncoding`은 파일 전체를 읽어 봅니다. 읽히면 그 인코딩의 텍스트이고, 읽히지 않으면 바이너리(`rule: 'undecodable'`)입니다. `EF BB BF`(UTF-8 BOM)도 같은 방법으로 확인합니다. 이 규칙은 [ADR-0044](../../docs/adr/0044-bom-must-decode.md)에서 정했습니다. 처음에 정한 ADR-0031에서는 BOM이 있으면 곧바로 텍스트로 판단했습니다.

예를 들어 파일 전체가 `FF FE 61 00 62` 다섯 바이트라면, BOM 뒤가 3바이트라서 2바이트 단위인 UTF-16으로 읽을 수 없습니다. 그래서 바이너리입니다. 이 확인에도 [8KB 끝에서 잘린 한글](#8kb-끝에서-잘린-한글)과 같은 규칙이 적용됩니다. `head`가 파일 전체가 아니라 앞부분이면, 끝에서 잘린 글자는 오류로 치지 않습니다.

### EUC-KR인지 확신할 수 없는 경우

EUC-KR은 규칙이 느슨해서, 일본어 옛 인코딩(Shift_JIS) 같은 다른 파일도 EUC-KR로 "읽히기는" 합니다. 다만 그렇게 읽으면 한글보다 한자가 훨씬 많이 나옵니다. 이 차이로 구분합니다.

아래 세 조건을 모두 만족해야 EUC-KR로 봅니다.

- 한글 글자가 하나 이상 있습니다.
- 한글 글자 수가 (한글 + 한자) 글자 수의 절반 이상입니다.
- 제어 문자가 전체 글자의 1% 미만입니다. 여기서 제어 문자는 U+0000~U+001F 가운데 탭·줄바꿈(LF)·캐리지 리턴(CR)을 뺀 글자입니다.

표를 그리는 선(`━`)이나 `※` 같은 기호는 한국어 문서에도 많이 나오므로 한글 비율 계산에서 뺍니다.

예를 들어 `━` 20개, ` 안내 `, `━` 20개로 된 줄은 한글이 2자, 한자가 0자입니다. 한글 비율이 100%이므로 EUC-KR로 봅니다. 반대로 한자 `行降項`만 있는 바이트는 한글이 하나도 없어서 EUC-KR로 보지 않습니다.

## 알아보는 서명과 확장자

### 서명

| 결과 | 형식 |
|---|---|
| 이미지 | png, jpeg, gif, webp, bmp, ico, avif |
| 바이너리 | pdf, zip, gzip, 7z, rar, woff, woff2, mp3, ogg, wav, elf(리눅스 실행 파일), wasm, java-class, sqlite, mp4(mov 포함) |

SVG는 서명이 없는 텍스트 형식이라 확장자로 알아봅니다.

### 확장자

확장자는 경로의 마지막 이름에서 마지막 점 뒤를 소문자로 읽습니다. `archive.tar.gz`는 `gz`입니다. `.gitignore`처럼 점으로 시작하는 이름은 확장자가 없는 것으로 봅니다.

| 확장자가 가리키는 종류 | 확장자 (일부) |
|---|---|
| 이미지 | png, jpg, jpeg, gif, webp, bmp, ico, avif, svg |
| 바이너리 | pdf, zip, gz, 7z, rar, jar, exe, dll, so, wasm, class, pyc, woff, woff2, ttf, otf, mp3, wav, mp4, mov, psd, tiff, heic, sqlite, db, docx, xlsx, pptx 등 |
| 텍스트 | txt, md, json, yaml, toml, csv, html, css, js, ts, tsx, vue, py, java, go, rs, c, cpp, sh, sql 등 |

전체 목록은 [src/extensions.ts](src/extensions.ts)에 있습니다. 목록에 없는 확장자는 무엇을 가리키는지 모르므로 확장자 충돌로 보지 않습니다.

## 한계

쓰기 전에 아래 한계를 알아 두세요.

- **BOM 없는 UTF-16 파일은 바이너리로 판단합니다.** NUL이 많아 4번 질문에 걸립니다. 흔하지 않은 파일이라 지원하지 않습니다.
- **BOM이 있으면 NUL 검사를 하지 않습니다.** BOM 인코딩으로 읽히기만 하면 NUL이 있어도 텍스트로 판단합니다. 예를 들어 UTF-32 파일(`FF FE 00 00`, 글자마다 4바이트를 쓰는 인코딩)은 UTF-16 LE로도 읽히므로 UTF-16 LE 텍스트로 판단합니다. `EF BB BF` 뒤에 NUL이 섞인 파일도 `utf-8-bom` 텍스트입니다. 이런 파일은 전체를 읽을 때 `decodeText`가 `binary-content` 오류를 던지므로, [전체를 읽다 실패하면 다시 판단합니다](#1-전체를-읽다-실패하면-다시-판단합니다)의 방법으로 바이너리 안내로 바꿉니다.
- **EUC-KR 판단은 추정입니다.** 다른 옛 인코딩과 완벽히 구분하지는 못하므로, 화면에 "추정"이라고 표시하는 것을 권합니다. EUC-KR을 넓힌 CP949 파일도 브라우저가 같은 방식으로 읽으므로 함께 다룹니다.
- **EUC-KR로 저장할 수 없습니다.** 저장 기능을 직접 넣으려면 약 17,000자의 변환표가 필요하고, 그만큼 패키지가 커지므로 넣지 않았습니다.
- **앞 8KB만 봅니다.** 뒤쪽에서 판단이 틀린 것이 드러나면 [전체를 읽다 실패하면 다시 판단합니다](#1-전체를-읽다-실패하면-다시-판단합니다)의 방법으로 바로잡습니다.
- **UTF-8·UTF-16·EUC-KR 밖의 인코딩은 바이너리로 판단합니다.** Shift_JIS나 Latin-1 파일이 여기에 들어갑니다. 단, 그 파일에 영어만 들어 있으면 UTF-8과 바이트가 같으므로 UTF-8 텍스트로 판단합니다.

## 테스트

```sh
pnpm --filter @codefold/file-type-detector test
```

테스트 파일마다 확인하는 내용은 다음과 같습니다.

| 파일 | 확인하는 것 |
|---|---|
| [signatures.test.ts](test/signatures.test.ts) | 서명마다 알아보는지, 서명과 첫 글자가 같은 평범한 문장은 서명으로 보지 않는지 |
| [extensions.test.ts](test/extensions.test.ts) | 확장자를 제대로 뽑는지(`archive.tar.gz`, `.gitignore`, `folder.v2/README`), 종류를 맞게 나누는지, 확장자가 `constructor`·`__proto__`여도 알려진 확장자로 잘못 보지 않는지 |
| [sniff.test.ts](test/sniff.test.ts) | BOM, NUL, UTF-8, 8KB 끝에서 잘린 한글, EUC-KR, 기호가 많은 EUC-KR 문서, BOM은 있지만 그 인코딩으로 읽히지 않는 파일 |
| [detect.test.ts](test/detect.test.ts) | 판단 흐름 전체: 빈 파일, 확장자 충돌, SVG, 읽기 전용, 크기 구분, `head` 길이 |
| [codec.test.ts](test/codec.test.ts) | 인코딩별로 읽고 쓰기, BOM 처리, 두 가지 오류 코드, UTF-16으로 쓸 때 짝 없는 서로게이트 바꾸기 |
| [full-text.test.ts](test/full-text.test.ts) | 파일 전체로 인코딩을 다시 판단하기 |
| [fixtures.test.ts](test/fixtures.test.ts) | 실제 샘플 파일 20개: 이미지 7개, 바이너리 5개, 인코딩별 텍스트, `logo.txt`라는 이름의 PNG 등 |
| [fuzz.test.ts](test/fuzz.test.ts) | 무작위 입력을 각각 2,000번 넣어 봅니다. 512바이트 이상인 무작위 바이트를 앞에 BOM(`EF BB BF`, `FF FE`, `FE FF`)을 붙이든 안 붙이든 텍스트로 판단하지 않는지, 무작위 문자열을 UTF-8로 저장한 것은 늘 텍스트로 판단하는지 |

샘플 파일은 [test/fixtures/make-fixtures.mjs](test/fixtures/make-fixtures.mjs)로 만듭니다. PNG·GIF·WebP·ICO·SVG 샘플은 실제로 열리는 1×1 이미지이고, JPEG·BMP 샘플과 바이너리 샘플에는 판단에 필요한 앞부분만 들어 있습니다.

## 관련 결정 기록

왜 이렇게 설계했는지는 아래 문서에 있습니다.

- [ADR-0010](../../docs/adr/0010-file-kind-detection.md): 파일 종류를 단계별로 판단하고 EUC-KR을 읽기 전용으로 여는 처음 결정(판단 순서와 결과 타입은 ADR-0031이 대체)
- [ADR-0031](../../docs/adr/0031-file-kind-detection-revised.md): 이미지 확장자보다 내용을 믿도록 고치고, 결과 타입을 지금 모양으로 정한 결정(판단 순서 3-1의 BOM 규칙은 ADR-0044가 대체)
- [ADR-0044](../../docs/adr/0044-bom-must-decode.md): BOM이 있어도 그 인코딩으로 읽혀야 텍스트로 판단하는 결정
