# @codefold/zip-archive

브라우저에서 **ZIP 파일을 열어 안의 파일 목록을 보고, 필요한 파일만 꺼내 읽고, 다시 ZIP으로 묶는** 패키지입니다. 외부 라이브러리 없이 ZIP 형식을 직접 읽고 씁니다. 압축과 압축 해제는 브라우저에 들어 있는 기능을 씁니다.

## 목차

- [왜 필요한가](#왜-필요한가)
- [먼저 알아 둘 개념](#먼저-알아-둘-개념)
- [한눈에 보는 사용 흐름](#한눈에-보는-사용-흐름)
- [ZIP을 여는 과정](#zip을-여는-과정)
- [파일을 읽는 세 가지 방법](#파일을-읽는-세-가지-방법)
- [ZIP을 만드는 방법](#zip을-만드는-방법)
- [항목 정보 읽는 법](#항목-정보-읽는-법)
- [오류](#오류)
- [쓰는 쪽이 꼭 처리해야 할 것](#쓰는-쪽이-꼭-처리해야-할-것)
- [상황별 결과](#상황별-결과)
- [API 레퍼런스](#api-레퍼런스)
- [잘못 읽지 않도록 넣은 규칙](#잘못-읽지-않도록-넣은-규칙)
- [한계](#한계)
- [테스트](#테스트)
- [관련 결정 기록](#관련-결정-기록)

## 왜 필요한가

이 프로젝트의 코드 에디터는 사용자가 올린 ZIP을 열어 파일을 고치고, 고친 결과를 다시 ZIP으로 내려받게 합니다. 이때 ZIP에 파일이 1만 개가 넘어도 빨라야 합니다.

흔한 ZIP 라이브러리는 편의를 위해 ZIP을 열 때 모든 파일의 압축을 풀거나, 내려받을 때 모든 파일을 다시 압축합니다. 파일이 많거나 크면 둘 다 오래 걸립니다. 이 패키지는 ZIP 형식을 직접 읽기 때문에 다음처럼 동작합니다.

- **열 때는 목록만 읽습니다.** ZIP 끝에 있는 "목차"만 읽으므로, 여는 시간은 파일 데이터 크기와 상관이 없습니다.
- **연 파일만 압축을 풉니다.** 사용자가 누른 파일 하나만 풀고, 파일 종류를 판단할 때는 앞부분만 풉니다.
- **내려받을 때 안 고친 파일은 다시 압축하지 않습니다.** 원래 ZIP 안의 압축된 바이트를 그대로 옮겨 담습니다. 고친 파일만 새로 압축합니다.

이 패키지의 특징은 다음과 같습니다.

- 외부 라이브러리가 없습니다. 압축과 해제는 브라우저 내장 `CompressionStream`·`DecompressionStream`으로 합니다.
- 특정 스레드에 묶이지 않습니다. 메인 스레드에서도, Web Worker 안에서도 똑같이 동작합니다. 이 프로젝트에서는 화면이 멈추지 않도록 앱이 이 패키지를 Web Worker(화면과 따로 실행되는 백그라운드 스레드) 안에서 쓰게 설계했습니다([ADR-0028](../../docs/adr/0028-zip-work-in-web-worker.md)).
- 결과로 주는 항목 정보는 메서드 없이 값만 든 객체라서 `postMessage`로 Worker에 그대로 보낼 수 있습니다.
- ZIP 형식을 직접 읽고 쓰기 때문에 "목차만 읽기", "원본 압축 바이트 그대로 옮기기" 같은 동작을 마음대로 고를 수 있습니다([ADR-0001](../../docs/adr/0001-zip-parser-in-house.md)).

## 먼저 알아 둘 개념

이 문서에 자주 나오는 용어를 먼저 풀어 둡니다. ZIP 구조를 처음 접한다면 이 절부터 읽으세요.

### ZIP 파일의 생김새

ZIP은 여러 파일을 하나로 묶은 파일입니다. 안에 든 파일 하나하나를 **항목(entry)** 이라고 부릅니다. 폴더도 항목이 될 수 있습니다.

ZIP 안은 크게 세 부분으로 되어 있습니다.

```
┌───────────────────────────────────────────┐
│ 로컬 헤더 1 │ 파일 1의 압축 데이터          │  ← 파일마다 반복
│ 로컬 헤더 2 │ 파일 2의 압축 데이터          │
│ …                                         │
├───────────────────────────────────────────┤
│ Central Directory (목차)                  │  ← 모든 항목의 이름·크기·위치
├───────────────────────────────────────────┤
│ EOCD (끝 표시)                             │  ← 목차가 어디 있는지
└───────────────────────────────────────────┘
```

- **로컬 헤더**: 각 파일 데이터 바로 앞에 붙은 짧은 머리말입니다. 이름과 크기 같은 정보가 들어 있습니다.
- **Central Directory**: ZIP 끝쪽에 있는 목차입니다. 모든 항목의 이름, 크기, 압축 방식, 그리고 그 항목의 로컬 헤더가 파일의 몇 번째 바이트에 있는지가 적혀 있습니다.
- **EOCD**(End of Central Directory): ZIP 끝에 있는 22바이트짜리 기록입니다. "목차는 몇 번째 바이트에서 시작하고 크기는 얼마, 항목은 몇 개"라고 적혀 있습니다. 뒤에 주석(ZIP 전체에 붙이는 설명 글)이 붙을 수 있어서, 주석이 없을 때만 파일의 맨 끝 22바이트가 EOCD입니다.

그래서 ZIP은 **끝에서부터** 읽습니다. 맨 끝의 EOCD를 찾아 목차 위치를 알아내고, 목차를 읽어 파일 목록을 만듭니다. 파일 데이터가 있는 앞부분은 건드리지 않아도 됩니다. 이 패키지가 1만 개짜리 ZIP도 빠르게 여는 이유입니다.

### 압축 방식

ZIP은 항목마다 압축 방식을 따로 정합니다. 목차에 번호로 적혀 있습니다.

| 번호 | 이름 | 뜻 |
|---|---|---|
| `0` | Stored | 압축하지 않고 그대로 넣었습니다. |
| `8` | Deflate | 가장 널리 쓰는 압축 방식입니다. 거의 모든 ZIP 도구가 이 방식을 씁니다. |
| 그 밖 | bzip2, LZMA 등 | 드물게 쓰는 방식입니다. 이 패키지는 목록에는 보여 주지만 압축을 풀지는 못합니다. |

### CRC-32

**CRC**(Cyclic Redundancy Check, 순환 중복 검사)는 파일 내용으로 계산한 32비트짜리 확인 값입니다. ZIP을 만들 때 항목마다 원래 내용의 CRC를 목차에 적어 둡니다. 압축을 푼 뒤 다시 계산한 값이 목차 값과 다르면, 데이터가 도중에 깨졌다는 뜻입니다.

### ZIP64

처음 ZIP 형식은 크기와 위치를 4바이트, 항목 수를 2바이트 칸에 적었습니다. 그래서 파일 하나가 약 4GB, 항목이 65,535개를 넘으면 칸에 다 적을 수 없습니다. 이 한도를 넘을 때 쓰는 확장 형식이 **ZIP64**입니다. 원래 칸에는 "여기 못 적음"이라는 표시값(`0xFFFFFFFF`)을 넣고, 진짜 값은 따로 마련한 8바이트 칸에 적습니다. 작은 ZIP에도 습관처럼 ZIP64 기록을 붙이는 도구가 있어서, ZIP을 읽는 쪽은 크기와 상관없이 ZIP64 기록이 있을 수 있다고 보고 처리해야 합니다.

### 파일 이름 인코딩

ZIP 안의 파일 이름도 바이트로 저장되므로, 어떤 인코딩으로 읽을지 정해야 합니다. 인코딩은 바이트를 글자로 바꾸는 규칙입니다. ZIP을 만든 도구마다 다릅니다.

| 인코딩 | 어디서 나오나 |
|---|---|
| UTF-8 | 요즘 도구 대부분. 목차에 "이름은 UTF-8"이라는 표시(UTF-8 플래그)를 켜 둡니다. macOS Finder는 UTF-8로 쓰면서도 이 표시를 켜지 않습니다. |
| CP949 | 한국어 Windows 탐색기로 만든 옛 ZIP. 한국어 Windows의 기본 인코딩입니다. |
| CP437 | 옛 DOS 시절의 기본 인코딩. ZIP 표준이 "표시가 없으면 CP437"로 정해 두었습니다. |

이름을 잘못된 인코딩으로 읽으면 `한글/문서.txt`가 `ÇÑ±Û/¹®¼­.txt`처럼 깨집니다.

macOS는 한글 이름을 자모로 쪼개 저장하기도 합니다(NFD 방식). `한`을 `ㅎ`+`ㅏ`+`ㄴ` 세 글자로 저장하는 식입니다. 눈으로는 같아 보여도 문자열 비교에서는 다른 이름이 되므로, 이 패키지는 이름을 모두 합친 형태(NFC)로 바꿔 돌려줍니다.

### 확장 필드(extra field)

목차의 항목 기록 끝에는 **확장 필드**를 덧붙일 수 있습니다. 원래 형식에 칸이 없는 정보를 담으려고 만든 추가 정보 칸입니다. 필드마다 "무슨 정보인지"를 알리는 2바이트 번호가 앞에 붙습니다. 이 패키지가 읽는 확장 필드는 두 가지이고, 모르는 필드는 건너뜁니다.

| 번호 | 이름 | 담긴 정보 |
|---|---|---|
| `0x0001` | ZIP64 확장 필드 | 원래 칸에 다 적지 못한 진짜 크기와 위치 |
| `0x7075` | 유니코드 경로 확장 필드 | 옛 인코딩으로 적은 이름과 함께 따로 적어 둔 UTF-8 이름 |

### 데이터 기술자(data descriptor)

어떤 도구는 파일을 압축하면서 바로 ZIP에 써 나가기 때문에, 로컬 헤더를 쓸 때는 압축된 크기를 아직 모릅니다. 그래서 로컬 헤더에는 크기를 0으로 적고, 데이터 뒤에 크기와 CRC를 따로 적습니다. 데이터 뒤에 따로 적는 이 기록을 **데이터 기술자**라고 부릅니다. macOS Finder가 이렇게 만듭니다. 이 패키지는 크기를 로컬 헤더가 아니라 목차에서 읽어서 이런 ZIP도 문제없이 엽니다.

### 파일 속성

ZIP은 항목마다 **속성**을 적어 둡니다. 셸 스크립트를 바로 실행할 수 있게 하는 Unix 실행 권한(`755`)이 대표적입니다. 속성의 뜻은 ZIP을 만든 운영체제에 따라 달라서, "어느 운영체제에서 만들었는지"(`versionMadeBy`)와 함께 읽어야 합니다.

### 바이트 출처(ByteSource)

이 패키지는 ZIP을 통째로 메모리에 올리지 않고, 필요한 범위만 그때그때 읽습니다. 그래서 지정한 바이트 범위만 골라 읽을 수 있는 대상이면 무엇이든 받습니다. 이것을 **바이트 출처**라고 부릅니다. 사용자가 올린 파일(`File`, `Blob`)이 가장 흔한 바이트 출처입니다.

## 한눈에 보는 사용 흐름

ZIP 하나를 열어 편집하고 내려받기까지 이 패키지의 함수를 다음 순서로 씁니다.

```
① ZIP 열기          openZip(파일)                → 항목 목록 (압축은 안 풂)
② 파일 종류 판단     zip.readHead(경로, 8192)     → 앞 8KB만 풂
③ 파일 전체 읽기     zip.readAll(경로)            → 전체를 풀고 CRC 확인
④ 원본 그대로 꺼내기  zip.readRaw(경로)            → 압축된 바이트 (풀지 않음)
⑤ 새 ZIP 만들기      writeZip(항목들)             → Blob
```

코드로 쓰면 다음과 같습니다.

```ts
import { openZip, writeZip, type ZipWriteItem } from '@codefold/zip-archive';

// ① 사용자가 올린 파일을 연다. 목차만 읽는다.
const zip = await openZip(uploadedFile); // File도 Blob이라 그대로 넘긴다

for (const entry of zip.entries) {
  console.log(entry.path, entry.isDirectory, entry.size);
}

// ② 파일 종류를 판단할 때는 앞부분만 푼다.
const head = await zip.readHead('src/main.py', 8192);

// ③ 에디터로 열 때는 전체를 푼다. 데이터가 깨졌으면 CRC 검사에서 오류가 난다.
const bytes = await zip.readAll('src/main.py');

// ④·⑤ 내려받을 때: 고친 파일만 새로 쓰고, 나머지는 원본 압축 바이트를 옮긴다.
const items: ZipWriteItem[] = [
  { type: 'file', path: 'src/main.py', data: editedBytes },
  { type: 'raw', path: 'data/input.txt', raw: await zip.readRaw('data/input.txt') },
  { type: 'directory', path: 'empty-folder' },
];
const result = await writeZip(items); // Blob (type: application/zip)
```

`uploadedFile`, `editedBytes`는 예시일 뿐입니다. 쓰는 쪽이 준비합니다.

## ZIP을 여는 과정

`openZip`은 다음 순서로 ZIP을 엽니다.

1. **맨 끝을 읽습니다.** EOCD 뒤에는 ZIP 전체에 붙이는 설명 글(주석)이 올 수 있어서, EOCD의 정확한 위치를 미리 알 수 없습니다. 주석은 최대 65,535바이트이므로, 파일 끝에서 최대 약 64KB를 읽어 뒤에서부터 EOCD 서명(EOCD가 시작되는 곳을 알리는 고정 바이트 `50 4B 05 06`)을 찾습니다. 찾지 못하면 ZIP이 아니라고 판단합니다. 확장자는 보지 않으므로, 이름이 `.zip`이어도 내용이 ZIP이 아니면 `NotZipError`입니다.
2. **ZIP64 기록이 있는지 봅니다.** EOCD 바로 앞에 ZIP64 표시가 있으면 ZIP64 EOCD를 읽어 진짜 크기와 위치를 얻습니다.
3. **분할 ZIP인지 확인합니다.** EOCD에 "이 ZIP은 여러 파일로 나뉜 파일 가운데 하나"라고 적혀 있으면 `SplitZipError`입니다.
4. **목차를 한 번에 읽습니다.** EOCD에 적힌 목차 범위를 한 번에 읽어 항목마다 이름, 크기, 압축 방식, 위치를 뽑습니다. 목차 안의 이름과 크기는 [먼저 알아 둘 개념](#먼저-알아-둘-개념)에서 본 규칙대로 해석합니다.
   - 암호가 걸린 항목이 하나라도 있으면 `EncryptedZipError`로 ZIP 전체를 거절합니다.
   - 이름은 [파일 이름 읽는 순서](#파일-이름-읽는-순서)대로 읽고 NFC로 바꿉니다.
   - Windows에서 만든 항목은 경로 구분자 `\`를 `/`로 바꿉니다.
   - 폴더 항목은 이름 끝의 `/`를 떼고 `isDirectory: true`로 표시합니다.
   - 이름이 비어 있거나 `/` 하나뿐인 항목은 목록에서 뺍니다.

여기까지 읽는 범위는 **파일 끝과 목차뿐**입니다. 파일 데이터는 한 바이트도 읽지 않습니다. 테스트에서 1만 개 항목 ZIP으로 이것을 확인합니다.

### 작은 ZIP으로 따라가 보기

`a.txt` 하나(내용 `hi`, 압축하지 않은 Stored)만 든 ZIP은 110바이트입니다. 바이트 위치는 0부터 셉니다.

| 위치 | 크기 | 내용 |
|---|---|---|
| 0 | 30 + 5 | 로컬 헤더(고정 30바이트) + 이름 `a.txt`(5바이트) |
| 35 | 2 | 데이터 `hi` |
| 37 | 46 + 5 | 목차의 항목 기록(고정 46바이트) + 이름. 로컬 헤더 위치 0, 크기 2, CRC가 적혀 있습니다. |
| 88 | 22 | EOCD. 목차 위치 37, 목차 크기 51, 항목 수 1이 적혀 있습니다. |

이 ZIP을 여는 과정은 다음과 같습니다.

1. `openZip`은 파일 끝을 읽고 뒤에서부터 `50 4B 05 06`을 찾습니다. 이 ZIP에서는 88번 바이트에 있습니다.
2. EOCD에 적힌 대로 37번부터 88번 바로 앞까지 51바이트를 한 번에 읽어 항목 목록을 만듭니다.
3. `readAll('a.txt')`를 부르면 0번의 로컬 헤더 30바이트를 읽습니다. 로컬 헤더의 이름 길이(5)와 확장 필드 길이(0)로 데이터 시작 위치를 0 + 30 + 5 + 0 = 35로 계산합니다.
4. 데이터 크기는 목차에 적힌 2를 씁니다. 35번부터 37번 바로 앞까지 읽고, CRC를 확인해 `hi`를 돌려줍니다.

### 파일 이름 읽는 순서

이름은 아래 순서로 시도하고, 처음 성공한 방법을 씁니다. 결과의 `nameEncoding`에 어느 방법이었는지가 담깁니다.

| 순서 | 방법 | 이유 |
|---|---|---|
| 1 | UTF-8 플래그가 켜져 있으면 UTF-8 | 만든 도구가 UTF-8이라고 밝혔습니다. |
| 2 | 유니코드 경로 확장 필드가 있고 이름과 맞으면 그 UTF-8 이름 | 일부 도구는 옛 인코딩 이름과 함께 UTF-8 이름을 따로 적어 둡니다. |
| 3 | UTF-8 규칙에 맞으면 UTF-8 | macOS Finder처럼 표시 없이 UTF-8로 쓰는 도구가 많습니다. UTF-8은 규칙이 엄격해서 다른 인코딩이 우연히 맞을 일이 거의 없습니다. |
| 4 | CP949 규칙에 맞으면 CP949 | 한국어 Windows 탐색기로 만든 ZIP입니다. |
| 5 | 나머지는 CP437 | ZIP 표준의 기본값입니다. CP437은 모든 바이트를 글자로 바꿀 수 있어 실패하지 않습니다. |

이 순서에서 알아 둘 점은 다음과 같습니다.

- **영문자·숫자만 든 이름은 `nameEncoding`이 `'utf-8'`입니다.** 이런 이름은 세 인코딩에서 바이트가 모두 같아서 3번에서 끝납니다. CP437로 만든 ZIP이어도 마찬가지입니다.
- **UTF-8 플래그가 켜져 있으면 일부러 너그럽게 읽습니다.** 바이트가 UTF-8 규칙에 어긋나도 오류를 내지 않고, 그 자리를 `�`(U+FFFD, 읽을 수 없는 글자를 대신하는 문자)로 바꿔 읽습니다. 이름 하나가 조금 깨졌다고 ZIP 전체를 못 여는 것보다 낫기 때문입니다. 이런 항목을 `raw` 항목으로 옮기면 원래 이름 바이트는 남지 않고, `�`가 섞인 이름이 UTF-8로 적힙니다. `raw` 항목의 이름은 늘 넘긴 `path`로 쓰기 때문입니다.
- **중국어(GBK)나 일본어(Shift-JIS) 이름은 알아보지 못합니다.** 오류 없이 CP949나 CP437의 다른 글자로 읽힙니다. 예를 들어 GBK로 적은 `中文`은 CP949 한자 `櫓匡`으로 읽힙니다.

## 파일을 읽는 세 가지 방법

`openZip`이 돌려준 객체로 파일을 읽습니다. 쓰임에 따라 세 가지를 고릅니다.

| 함수 | 하는 일 | 쓰는 곳 |
|---|---|---|
| `readHead(path, bytes)` | 앞 `bytes`바이트만 풉니다. 필요한 만큼 풀리면 바로 멈춥니다. | 파일 종류 판단 (`@codefold/file-type-detector`에 넘길 앞 8KB) |
| `readAll(path)` | 전체를 풀고 크기와 CRC를 확인합니다. | 에디터로 열기, 이미지 보여 주기 |
| `readRaw(path)` | 압축을 풀지 않고, 압축된 바이트를 `Blob` 조각으로 돌려줍니다. | 내려받을 때 안 고친 파일을 옮겨 담기 |

알아 둘 점은 다음과 같습니다.

- **`readHead`는 CRC를 확인하지 않습니다.** 앞부분만 풀었으니 전체 CRC를 계산할 수 없습니다. 데이터가 깨졌는지는 `readAll`에서 드러납니다.
- **`readRaw`는 메모리로 복사하지 않습니다.** 원래 ZIP의 일부를 가리키는 `Blob` 조각이라, 큰 파일도 메모리를 거의 쓰지 않습니다. 다만 데이터가 어디서 시작하는지 알려고 로컬 헤더 30바이트는 읽습니다. 로컬 헤더가 없거나 데이터가 파일 밖을 가리키면 `CorruptZipError`입니다.
- **`readRaw`는 CRC를 확인하지 않습니다.** 원본 바이트를 그대로 옮기므로, 원본 항목이 깨져 있으면 새 ZIP에서도 깨져 있습니다.
- **`readRaw`는 압축 방식을 가리지 않습니다.** bzip2처럼 풀 수 없는 항목도 원본 그대로 옮길 수 있어서, 내려받은 ZIP에서 그 파일이 빠지지 않습니다.
- **경로는 `entries`의 `path`와 똑같이 넘깁니다.** 폴더 경로를 넘기면 `ZipEntryNotFoundError`입니다. 폴더에는 읽을 내용이 없습니다. 그래서 원본의 빈 폴더를 새 ZIP에 남기려면 `readRaw`가 아니라 `directory` 항목으로 새로 씁니다. 이때 원본 폴더의 속성과 수정 시각은 이어받지 않습니다.

## ZIP을 만드는 방법

`writeZip`에 항목 배열을 넘기면 새 ZIP을 `Blob`으로 만들어 줍니다. 항목은 세 종류입니다.

### `raw`: 원본 압축 바이트를 그대로 옮깁니다

```ts
{ type: 'raw', path: 'data/input.txt', raw: await zip.readRaw('data/input.txt') }
```

안 고친 파일에 씁니다. 압축을 풀지도, 다시 압축하지도 않습니다. 압축 방식, CRC, 수정 시각, 속성도 원본 그대로 가져갑니다. `path`를 원래와 다르게 주면 **이름만 바꿔** 옮길 수 있습니다. 이름을 바꾼 파일도 다시 압축할 필요가 없습니다.

### `file`: 새 내용을 압축해 씁니다

```ts
{
  type: 'file',
  path: 'scripts/run.sh',
  data: editedBytes,               // Uint8Array
  modified: new Date(),            // 생략하면 지금 시각
  attributesFrom: originalEntry,   // 생략하면 일반 파일(0644)
}
```

고친 파일이나 새로 만든 파일에 씁니다. Deflate로 압축합니다. 다만 이미 압축된 데이터처럼 압축해도 크기가 줄지 않으면 압축하지 않고 그대로(Stored) 넣습니다.

`attributesFrom`에 원본 항목을 넘기면 원래 속성(실행 권한 등)을 이어받습니다. 넘기지 않으면 일반 파일 권한(`0644`, 읽기·쓰기만 되고 실행은 안 되는 권한)으로 씁니다. 셸 스크립트를 고친 뒤 이 값을 빠뜨리면, 받은 사람이 그 스크립트를 바로 실행할 수 없게 됩니다.

### `directory`: 폴더 항목을 씁니다

```ts
{ type: 'directory', path: 'empty-folder', modified: new Date() }
```

빈 폴더를 남기고 싶을 때 씁니다. 파일이 든 폴더는 파일 경로만으로도 압축 해제 도구가 폴더를 만들어 주므로 꼭 넣을 필요는 없습니다. 이 프로젝트는 트리에서 보이던 빈 폴더가 받은 ZIP에서 사라지지 않도록 빈 폴더만 이 항목으로 넣습니다([ADR-0033](../../docs/adr/0033-export-keeps-empty-directories.md)).

### 만들어지는 ZIP의 규칙

`writeZip`이 만드는 ZIP은 원본과 상관없이 다음 규칙을 따릅니다.

- 이름은 모두 **UTF-8**로 쓰고 UTF-8 플래그를 켭니다. 원본 이름이 CP949였어도 새 ZIP에서는 UTF-8입니다.
- 항목이 65,535개를 넘거나, 크기·위치가 4바이트 칸의 최댓값(`0xFFFFFFFF`, 4,294,967,295바이트, 약 4GB) 이상이면 **ZIP64 기록을 자동으로** 붙입니다.
- 데이터 기술자는 쓰지 않습니다. 크기를 모두 로컬 헤더에 적어 어느 도구로 열어도 읽힙니다.
- 결과 `Blob`은 여러 조각을 이어 붙여 만들므로, `raw` 항목의 원본 바이트를 메모리로 복사하지 않습니다.
- `file` 항목은 하나씩 차례로, 메모리 안에서 통째로 압축합니다. 그래서 압축하는 동안 원래 내용과 압축한 결과가 함께 메모리에 있습니다.
- 넘긴 순서대로 씁니다. 같은 경로가 두 번 들어가도 막지 않으므로, 중복은 쓰는 쪽이 걸러야 합니다.
- **쓸 수 없는 항목이 있으면 `InvalidZipItemError`를 던집니다.** 압축을 시작하기 전에 모든 항목의 이름을 먼저 확인하므로, 하나라도 걸리면 아무것도 압축하지 않고 멈춥니다. 오류 객체의 `path`에 걸린 항목의 경로가 들어 있습니다. 걸리는 경우는 다음과 같습니다.
  - 경로가 비어 있습니다. `directory` 항목은 끝의 `/`를 뗀 뒤 비어 있으면 걸립니다.
  - `raw`나 `file` 항목의 경로가 `/`로 끝납니다. 다시 열면 폴더로 보이기 때문입니다.
  - 이름을 UTF-8로 바꾸면 65,535바이트를 넘습니다. 이름 길이 칸이 2바이트라 적을 수 없습니다.
- `directory` 항목의 `path` 끝에 `/`가 있으면 떼고, 한 번만 붙여 씁니다. `a/`를 넘겨도 `a`를 넘겨도 `a/`로 써집니다.
- 그 밖의 이상한 경로는 막지 않습니다. 맨 앞이 `/`인 경로나 `..`이 든 경로도 넘긴 그대로 씁니다. 원본 ZIP에 있던 이런 항목을 원본 그대로 내보내야 하기 때문입니다([ADR-0038](../../docs/adr/0038-zip-slip-entries-exported-unchanged.md)).

## 항목 정보 읽는 법

`zip.entries`의 각 항목은 `ZipEntry` 객체입니다. 자주 쓰는 필드부터 적었습니다.

| 필드 | 설명 |
|---|---|
| `path` | ZIP 안의 경로입니다. 구분자는 `/`이고, 폴더도 끝에 `/`를 붙이지 않습니다. 이름은 NFC로 바꿔 두었습니다. |
| `isDirectory` | 폴더 항목이면 `true`입니다. |
| `size` | 압축을 풀었을 때의 크기(바이트)입니다. |
| `compressedSize` | ZIP 안에서 차지하는 압축된 크기(바이트)입니다. |
| `method` | 압축 방식 번호입니다. `0`은 Stored, `8`은 Deflate이고, 나머지는 읽을 수 없습니다. |
| `nameEncoding` | 이름을 어떤 인코딩으로 읽었는지입니다. `'utf-8'`, `'cp949'`, `'cp437'` 가운데 하나입니다. |
| `index` | 목차 안의 순서(0부터)입니다. 목록에서 뺀 항목이 있으면 배열 위치와 다를 수 있습니다. |
| `crc32` | 목차에 적힌 CRC 값입니다. |
| `externalAttributes`, `versionMadeBy` | 파일 속성과 만든 운영체제입니다. `writeZip`의 `attributesFrom`에 넘길 때 씁니다. |
| `dosTime`, `dosDate` | 수정 시각입니다. ZIP이 쓰는 옛 DOS 형식 그대로입니다. |
| `flags`, `localHeaderOffset` | ZIP 내부 정보입니다. `flags`는 [값 해석하기](#값-해석하기)를 보세요. `localHeaderOffset`은 로컬 헤더가 시작하는 바이트 위치입니다. |

`entries`에는 목차에 적힌 항목이 순서대로 들어 있습니다. 다만 이름이 비어 있거나 `/` 하나뿐인 항목은 뺍니다. 그래서 `index`는 목차 안의 번호이고, 배열 위치와 다를 수 있습니다. 폴더 항목, `__MACOSX/` 같은 부가 파일, 같은 경로가 두 번 나온 항목은 그대로 있습니다. 무엇을 보여 줄지는 쓰는 쪽이 정합니다.

### 값 해석하기

이 패키지는 수정 시각과 속성을 읽기 쉬운 값으로 바꿔 주는 함수를 따로 내보내지 않습니다. 필요하면 아래처럼 직접 읽습니다.

```ts
// 수정 시각. 기기의 현지 시각이고, 초는 2초 단위다.
// dosDate: 연도(1980년부터 센 값) 7비트 | 월 4비트 | 일 5비트
// dosTime: 시 5비트 | 분 6비트 | 초÷2 5비트
const modified = new Date(
  1980 + (entry.dosDate >> 9),
  ((entry.dosDate >> 5) & 0x0f) - 1,
  entry.dosDate & 0x1f,
  entry.dosTime >> 11,
  (entry.dosTime >> 5) & 0x3f,
  (entry.dosTime & 0x1f) * 2,
);

// Unix 권한. 만든 운영체제(versionMadeBy의 위쪽 바이트)가 3(Unix)일 때만 뜻이 있다.
const unixMode =
  entry.versionMadeBy >> 8 === 3 ? (entry.externalAttributes >>> 16) & 0o777 : undefined; // 예: 0o755
```

`flags`는 비트마다 뜻이 다릅니다. 자주 보는 비트는 다음과 같습니다.

| 비트 | 값 | 뜻 |
|---|---|---|
| 0 | `0x1` | 암호가 걸린 항목입니다. 이 패키지는 이런 ZIP을 열지 않습니다. |
| 3 | `0x8` | 데이터 기술자를 썼습니다. |
| 11 | `0x800` | 이름이 UTF-8입니다(UTF-8 플래그). |

## 오류

이 패키지가 던지는 오류는 모두 `ZipError`를 상속합니다. `error instanceof ZipError`로 한꺼번에 거를 수 있습니다.

| 오류 | 언제 나오나 | 나오는 시점 |
|---|---|---|
| `NotZipError` | ZIP이 아닙니다. EOCD를 찾지 못했습니다. | 열 때 |
| `SplitZipError` | 여러 파일로 나뉜 분할 ZIP의 일부입니다. | 열 때 |
| `EncryptedZipError` | 암호가 걸린 항목이 있습니다. | 열 때 |
| `CorruptZipError` | 구조가 깨졌습니다. 목차가 중간에 끝났거나, 위치가 파일 밖을 가리키거나, 크기·CRC가 맞지 않습니다. | 열 때, `readHead`·`readAll`·`readRaw` |
| `UnsupportedCompressionError` | Stored·Deflate가 아닌 압축 방식이라 풀 수 없습니다. 오류 객체에 `path`와 `method`가 들어 있습니다. | `readHead`·`readAll` |
| `ZipEntryNotFoundError` | 그 경로의 파일 항목이 없습니다. 폴더 경로를 넘겨도 이 오류입니다. 오류 객체에 `path`가 들어 있습니다. | `readHead`·`readAll`·`readRaw` |
| `InvalidZipItemError` | `writeZip`에 넘긴 항목을 ZIP에 쓸 수 없습니다. 빈 경로, `/`로 끝나는 파일 경로, 65,535바이트를 넘는 이름입니다. 오류 객체에 `path`가 들어 있습니다. | `writeZip` (압축을 시작하기 전) |

`readAll`은 드물게 `ZipError`가 아닌 `RangeError`를 그대로 던질 수 있습니다. 목차에 적힌 크기만큼 메모리를 잡지 못했을 때입니다([크기를 부풀린 항목](#크기를-부풀린-항목-압축-폭탄-방어)).

오류 메시지는 한국어입니다(예: `암호가 걸린 ZIP은 열 수 없습니다`). 화면에 보여 줄 문구는 이 메시지를 그대로 쓰기보다, 쓰는 쪽이 오류 종류(`instanceof`)를 보고 따로 정하기를 권합니다.

Worker 안에서 던진 오류는 메인 스레드로 넘어오면 어떤 오류였는지 구분할 수 없게 됩니다. 처리 방법은 [쓰는 쪽이 꼭 처리해야 할 것](#1-큰-zip은-web-worker에서-씁니다)에 있습니다.

## 쓰는 쪽이 꼭 처리해야 할 것

이 패키지는 ZIP을 읽고 쓰기만 합니다. 아래 다섯 가지는 이 패키지를 쓰는 쪽이 맡아야 합니다.

### 1. 큰 ZIP은 Web Worker에서 씁니다

목차를 읽고, 압축을 풀고, 새 ZIP을 만드는 일은 파일이 많거나 크면 시간이 걸립니다. 메인 스레드에서 하면 그동안 화면이 멈추므로 Worker 안에서 쓰세요. 이 패키지는 특정 스레드에 묶이지 않으므로 Worker 안에서도 코드가 똑같습니다.

- 업로드한 `File`은 `postMessage`로 넘겨도 안의 바이트가 복사되지 않습니다.
- `readHead`·`readAll`이 돌려주는 배열은 다른 데이터와 나눠 쓰지 않는 전용 `ArrayBuffer`에 담겨 있습니다. 그래서 `postMessage(data, [data.buffer])`로 버퍼 소유권을 넘기면 복사 없이 보낼 수 있습니다.
- **Worker에서 던진 오류는 메인 스레드에서 구분할 수 없습니다.** 오류 객체를 `postMessage`로 넘기면 브라우저가 값을 복사하면서 평범한 `Error`로 바꿉니다. `name`은 `'Error'`가 되고, `instanceof NotZipError`는 `false`이고, `path`·`method`는 사라집니다. Worker 안에서 `error.name`과 필요한 값을 따로 담아 보내고, 메인 스레드에서 그 이름으로 오류를 다시 구분하세요.

### 2. 목록에서 보여 줄 항목을 고릅니다

`entries`는 목차를 있는 그대로 돌려줍니다. 다음은 쓰는 쪽이 정합니다.

- **폴더 항목이 없는 ZIP도 있습니다.** 이런 ZIP은 `src/main.py`만 있고 `src` 폴더 항목은 따로 없으므로, 트리를 만들 때 파일 경로에서 폴더를 만들어 내야 합니다.
- **`__MACOSX/`, `.DS_Store` 같은 부가 파일**을 숨길지 정합니다. macOS Finder로 만든 ZIP에 들어 있습니다.
- **같은 경로가 두 번 나오면** `readAll` 등은 뒤쪽 항목을 읽습니다. 대부분의 압축 해제 도구가 뒤 항목으로 덮어쓰기 때문입니다. 목록에서도 한 번만 보여 주세요. 앞쪽 항목은 경로로 읽거나 `readRaw`로 꺼낼 방법이 없으므로, 내려받은 ZIP에는 뒤쪽 항목만 남습니다.
- **`../`나 `/`로 시작하는 경로**를 걸러 냅니다. 이 패키지는 경로를 고치거나 막지 않습니다. 브라우저 안에서만 다루면 해가 없지만, 경로를 실제 파일 시스템에 쓰는 곳이라면 반드시 걸러야 합니다.

이 프로젝트에서는 `@codefold/virtual-fs`가 위의 일을 모두 합니다. 경로에서 폴더를 만들어 내고, 맨 앞의 `/`를 떼고, 부가 파일과 `..`이 든 경로를 트리에서 숨기고, 같은 경로는 뒤쪽 항목만 씁니다. 연 ZIP을 virtual-fs에 넘긴다면 따로 할 필요가 없습니다.

### 3. 오류를 파일 단위로 처리합니다

열 때 나는 오류(`NotZipError`, `EncryptedZipError` 등)는 ZIP 전체를 열 수 없다는 뜻입니다. 읽을 때 나는 오류(`CorruptZipError`, `UnsupportedCompressionError`)는 **그 파일 하나만** 문제라는 뜻입니다. 다른 파일은 계속 읽을 수 있으니, 그 파일의 탭에만 오류를 보여 주세요. `readAll`이 던진 `RangeError`(메모리 부족)도 그 파일 하나의 문제로 다루세요.

### 4. 내려받을 때 원래 속성을 이어 줍니다

고친 파일을 `file` 항목으로 쓸 때 원본 항목을 `attributesFrom`으로 넘기세요. 이름을 바꾼 파일이라면 **원래 경로**로 원본 항목을 찾아야 합니다. 이 프로젝트에서는 내보내기 계획(내려받을 ZIP에 넣을 항목 목록)의 각 항목에 원래 경로를 함께 적어 둡니다([ADR-0032](../../docs/adr/0032-export-write-keeps-original-path.md)).

`ZipArchive`에는 경로로 항목을 찾는 함수가 따로 없습니다. 원본 항목은 `(await zip.readRaw(원래 경로)).entry`로 찾습니다. `readRaw`는 `readAll`과 같은 규칙으로 항목을 고르므로(같은 경로면 뒤 항목, 폴더는 제외), 읽은 항목과 속성을 가져온 항목이 어긋나지 않습니다. `entries`에서 직접 찾는다면 같은 경로 가운데 **마지막** 파일 항목을 고르세요.

`@codefold/virtual-fs`의 내보내기 계획(`ExportEntry[]`)을 `writeZip` 항목으로 바꾸는 코드는 다음과 같습니다. 이 프로젝트에서는 Worker 안에서 이 일을 합니다(ADR-0028). 비슷한 일을 하는 실제 코드는 앱의 [zipWorkerHandler.ts](../../apps/zip-editor/src/services/zip/zipWorkerHandler.ts)에 있습니다. 앱의 코드는 아래 예시와 두 가지가 다릅니다. react-code-editor의 내보내기 계획(`ExportPlan`)을 받고, 원본 항목을 `readRaw`가 아니라 `entries`로 만든 `Map`에서 찾습니다.

```ts
import { writeZip, type ZipArchive, type ZipWriteItem } from '@codefold/zip-archive';
import type { ExportEntry } from '@codefold/virtual-fs';

async function exportZip(
  zip: ZipArchive,
  entries: readonly ExportEntry[],
  dirtyContents: Readonly<Record<string, Uint8Array<ArrayBuffer>>>, // write 항목의 새 바이트
): Promise<Blob> {
  const items: ZipWriteItem[] = [];
  for (const e of entries) {
    if (e.type === 'copy') {
      // 안 고친 파일: 원래 경로의 압축 바이트를 새 경로로 옮긴다.
      items.push({ type: 'raw', path: e.path, raw: await zip.readRaw(e.originalPath) });
    } else if (e.type === 'write') {
      // 고친 파일: 새 바이트가 없으면 writeZip에 넘기기 전에 오류를 던진다.
      const data = dirtyContents[e.path];
      if (!data) throw new Error(`내보낼 내용이 없습니다: ${e.path}`);
      // 원래 경로가 있으면 그 항목의 속성을 이어받는다. 새 파일은 원래 경로가 없다.
      const original = e.originalPath ? (await zip.readRaw(e.originalPath)).entry : undefined;
      items.push({ type: 'file', path: e.path, data, attributesFrom: original });
    } else {
      // 빈 폴더(ADR-0033)
      items.push({ type: 'directory', path: e.path });
    }
  }
  return writeZip(items);
}
```

### 5. 메모리를 생각합니다

`readAll`은 파일 전체를 메모리에 올립니다. 수백 MB짜리 파일을 여러 개 동시에 열면 브라우저 메모리가 모자랄 수 있습니다.

- `readRaw`는 파일 크기와 상관없이 메모리를 거의 쓰지 않습니다.
- ZIP을 열 때는 파일 데이터 크기와 상관없이 목차 전체를 한 번에 메모리로 읽습니다. 그래서 항목 수에 비례해 메모리를 씁니다. 목차는 EOCD 앞에서 끝나야 하므로, 목차를 읽느라 쓰는 메모리는 ZIP 파일 크기를 넘지 않습니다. 목차 범위가 EOCD를 넘는다고 적혀 있으면, 읽기 전에 `CorruptZipError`로 거절합니다.
- `writeZip`은 고친 파일마다 원래 내용과 압축한 결과를 함께 메모리에 둡니다. 고친 파일이 크고 많으면 그만큼 메모리를 씁니다.

## 상황별 결과

흔히 만나는 ZIP마다 어떤 결과가 나오는지 모았습니다.

| 상황 | 결과 |
|---|---|
| `zip` 명령으로 만든 ZIP | 정상. 폴더 항목과 파일 항목이 모두 나옵니다. |
| `zip -D`로 만든 ZIP (폴더 항목 없음) | 정상. 파일 항목만 나옵니다. |
| macOS Finder로 만든 ZIP | 정상. 이름은 UTF-8로 읽고, `__MACOSX/` 항목도 목록에 나옵니다. |
| 한국어 Windows 탐색기로 만든 옛 ZIP | 정상. 이름을 CP949로 읽습니다(`nameEncoding: 'cp949'`). |
| 한글 이름이 자모로 쪼개진 ZIP (NFD) | 정상. 이름을 합친 형태(NFC)로 돌려줍니다. |
| Windows에서 `\`로 경로를 적은 ZIP | 정상. `dir\file.txt`를 `dir/file.txt`로 바꿉니다. |
| 작은데 ZIP64 기록이 붙은 ZIP | 정상. |
| 항목이 65,535개를 넘는 ZIP | 정상. ZIP64 기록으로 읽습니다. |
| 끝에 다른 바이트가 붙은 ZIP | 정상. 끝에서 EOCD를 찾아 엽니다. 다만 EOCD와 주석, 뒤에 붙은 바이트가 모두 파일 끝 65,557바이트 안에 들어야 합니다. 넘으면 EOCD를 찾지 못해 `NotZipError`입니다. |
| 앞에 다른 바이트가 붙었는데 목차의 위치를 고쳐 쓰지 않은 ZIP (일부 자동 실행 압축 파일 등) | 열 때 `CorruptZipError`. 목차에 적힌 위치를 보정하지 않습니다. `zip -A` 같은 명령으로 위치를 고쳐 쓴 파일은 목차의 위치가 이미 맞으므로 열립니다. |
| 이름만 `.zip`인 텍스트 파일 | 열 때 `NotZipError` |
| 암호를 건 ZIP | 열 때 `EncryptedZipError` |
| 분할 ZIP의 마지막 조각 | 열 때 `SplitZipError` |
| 끝이 잘린 ZIP (받다 만 파일 등) | 대부분 열 때 `NotZipError`입니다. 끝에 있던 EOCD가 함께 잘려 나가기 때문입니다. EOCD는 남고 목차가 잘렸으면 `CorruptZipError`입니다. |
| bzip2로 압축한 항목 | 목록에는 나옵니다. 읽으면 `UnsupportedCompressionError`. `readRaw`로 원본 복사는 됩니다. |
| 데이터가 깨진 항목 | 목록에는 나옵니다. `readAll`에서 CRC가 맞지 않아 `CorruptZipError`. `readRaw`로 옮기면 깨진 채로 옮겨집니다. |
| 크기를 부풀려 적은 항목 | 목록에는 적힌 크기 그대로 나옵니다. 압축률로 불가능한 크기면 `readAll`이 풀기 전에 `CorruptZipError`로 거절합니다. 가능한 범위 안이면 적힌 크기만큼 메모리를 먼저 잡고 풀어 본 뒤, 덜 풀리면 `CorruptZipError`입니다. 그 메모리를 잡지 못하면 `RangeError`입니다. |

## API 레퍼런스

공개 함수는 주 함수 두 개와 도우미 함수 하나입니다. 파일을 다루는 순서대로 적었습니다.

| 이름 | 쓰는 시점 | 돌려주는 값 |
|---|---|---|
| `openZip(input)` | ZIP을 열 때 | `Promise<ZipArchive>` |
| `writeZip(items)` | 새 ZIP을 만들 때 | `Promise<Blob>` |
| `blobSource(blob)` | `Blob`을 `ByteSource`로 감쌀 때 (보통은 필요 없음) | `ByteSource` |

### `openZip(input: Blob | ByteSource): Promise<ZipArchive>`

ZIP을 열어 목차를 읽습니다. `File`이나 `Blob`을 그대로 넘기면 됩니다. 다른 저장소에서 범위를 읽고 싶으면 `ByteSource`를 직접 만들어 넘깁니다. 열 수 없으면 [열 때 나는 오류](#오류)를 던집니다.

### `ZipArchive`

`openZip`이 돌려주는 객체입니다.

| 멤버 | 설명 |
|---|---|
| `entries` | 항목 목록(`ZipEntry[]`). 목차 순서 그대로이고, 이름이 비어 있거나 `/` 하나뿐인 항목만 뺐습니다. |
| `list()` | `entries`를 `Promise`로 돌려줍니다. 읽기 함수를 모두 비동기로 맞춘 인터페이스에 넘길 때 씁니다. |
| `readHead(path, bytes)` | 앞 `bytes`바이트를 풀어 `Uint8Array`로 돌려줍니다. 파일이 더 작으면 파일 전체를 돌려줍니다. |
| `readAll(path)` | 전체를 풀어 `Uint8Array`로 돌려줍니다. 크기와 CRC를 확인합니다. |
| `readRaw(path)` | `{ entry, data }`를 돌려줍니다. `data`는 압축된 바이트의 `Blob` 조각입니다. `writeZip`의 `raw` 항목에 그대로 넘깁니다. |

`list`·`readHead`·`readAll`은 `@codefold/virtual-fs`가 정하는 파일 출처(`FileSource`)와 모양을 맞췄습니다. `ZipEntry`도 virtual-fs의 `FileSourceEntry`(`path`, `isDirectory`, `size`)를 모두 갖추고 있습니다. 두 패키지는 서로 import하지 않지만, 모양이 같으므로 연 ZIP을 그대로 `virtual-fs`에 넘길 수 있습니다(ADR-0016).

이 프로젝트의 앱은 그렇게 하지 않습니다. 앱은 `ZipArchive`를 Worker 안에서 만들고, 메인 스레드의 virtual-fs에는 같은 모양의 대리 객체(Worker에 메시지를 보내 결과를 받아 오는 객체)를 넘깁니다. `readRaw`와 `writeZip`은 Worker 밖으로 나오지 않습니다(ADR-0028). 실제 코드는 앱의 [zipWorkerHandler.ts](../../apps/zip-editor/src/services/zip/zipWorkerHandler.ts)(Worker 쪽)와 [zipClient.ts](../../apps/zip-editor/src/services/zip/zipClient.ts)(메인 스레드의 대리 객체)에 있습니다.

`FileSource`의 `readHead`·`readAll`은 반환 타입이 그냥 `Uint8Array`입니다. 그래서 "전용 `ArrayBuffer`에 담긴다"는 보장은 `FileSource` 약속에 들어 있지 않습니다. 대리 객체를 만든다면 이 보장을 직접 지켜야 합니다.

### `writeZip(items: readonly ZipWriteItem[]): Promise<Blob>`

항목 배열로 새 ZIP을 만듭니다. 항목 종류와 규칙은 [ZIP을 만드는 방법](#zip을-만드는-방법)에 있습니다. 결과 `Blob`의 `type`은 `application/zip`입니다. 쓸 수 없는 항목이 있으면 압축을 시작하기 전에 `InvalidZipItemError`를 던집니다([만들어지는 ZIP의 규칙](#만들어지는-zip의-규칙)).

### `ByteSource`

범위를 읽을 수 있는 바이트 출처입니다. 보통은 `Blob`을 넘기면 되고, 직접 만들 일은 드뭅니다. 테스트에서 어느 범위를 읽었는지 기록하거나, HTTP Range 요청처럼 다른 곳에서 읽어 올 때 만듭니다.

| 멤버 | 설명 |
|---|---|
| `size` | 전체 크기(바이트) |
| `read(start, end)` | `start`부터 `end` 바로 앞까지 읽어 `Uint8Array`로 돌려줍니다. 돌려주는 배열은 다른 데이터와 나눠 쓰지 않는 전용 `ArrayBuffer`에 담겨 있어야 합니다. |
| `slice(start, end)` | 같은 범위를 복사 없이 `Blob`으로 돌려줍니다. 스트림으로 압축을 풀 때와 원본 바이트를 옮길 때 씁니다. |

### `blobSource(blob: Blob): ByteSource`

`Blob`을 `ByteSource`로 감쌉니다. `openZip`은 `Blob`을 받으면 안에서 이 함수를 부르므로, 직접 부를 일은 거의 없습니다.

### 타입

이 패키지가 내보내는 타입은 다음과 같습니다.

| 타입 | 설명 |
|---|---|
| `ZipEntry` | 항목 하나의 정보. [항목 정보 읽는 법](#항목-정보-읽는-법) 참고 |
| `RawZipEntry` | `readRaw`의 결과. `{ entry: ZipEntry; data: Blob }` |
| `ZipWriteItem` | `writeZip`에 넘기는 항목. `raw`, `file`, `directory` 세 종류 |
| `NameEncoding` | `'utf-8'`, `'cp949'`, `'cp437'` |

## 잘못 읽지 않도록 넣은 규칙

실제 도구로 만든 ZIP과 일부러 망가뜨린 ZIP으로 테스트하면서 찾은 경우와 막는 방법을 모았습니다.

### 주석 안의 가짜 EOCD

EOCD 뒤에는 주석이 붙을 수 있고, 주석에는 아무 바이트나 들어갑니다. 주석 안에 우연히 EOCD 서명과 같은 바이트가 있으면, 뒤에서부터 찾다가 가짜를 먼저 만납니다.

그래서 "EOCD 크기 + 주석 길이"가 파일 끝과 **딱 맞는** 서명만 진짜로 봅니다. 그런 서명이 없을 때만(끝에 다른 바이트가 더 붙은 ZIP), 적힌 주석 길이만큼 읽어도 파일 끝을 넘지 않는 서명 가운데 가장 뒤의 것을 진짜로 봅니다.

### 항목 수를 잘못 적은 ZIP

EOCD의 항목 수 칸은 2바이트라 65,535까지만 적힙니다. 어떤 도구는 항목이 그보다 많을 때 ZIP64를 쓰지 않고 항목 수를 65,536으로 나눈 나머지만 적습니다. 70,000개면 4,464로 적는 식입니다. 이 수만 믿고 멈추면 나머지 항목이 목록과 다운로드에서 말없이 빠집니다.

그래서 항목 수보다 **목차 크기**를 믿고, 목차가 끝날 때까지 읽습니다. 반대로 목차를 끝까지 읽었는데 항목이 EOCD에 적힌 수보다 적으면 깨진 ZIP으로 봅니다.

### 크기를 부풀린 항목 (압축 폭탄 방어)

목차에 적힌 크기는 믿을 수 없는 입력입니다. 작은 파일에 "10GB"라고 적어 두면, 그만큼 메모리를 잡다가 브라우저가 멈출 수 있습니다.

- Deflate는 아무리 잘 압축해도 약 1,032배까지만 줄어듭니다. 적힌 크기가 "압축된 크기 × 1,032 + 1,024바이트"보다 크면 잘못 적힌 값이므로 **풀기 전에** 거절합니다.
- Stored는 압축하지 않은 것이라 두 크기가 같아야 합니다. 다르면 거절합니다.
- 풀다가 적힌 크기보다 더 풀리면 그 자리에서 멈추고 거절합니다. 덜 풀려도 거절합니다.

앞의 두 검사는 `readAll`을 부를 때, 메모리를 잡기 전에 합니다. 열 때는 하지 않으므로 목록에는 적힌 크기가 그대로 나옵니다. `readHead`는 넘긴 `bytes`만큼만 메모리를 잡으므로 이 검사를 하지 않습니다.

이 방어는 **압축률로 불가능한 크기만** 미리 막습니다. 한도 안에서 부풀린 크기는 막지 못합니다. `readAll`은 Deflate 항목을 풀기 전에 적힌 크기만큼 메모리를 먼저 잡기 때문입니다. 예를 들어 압축된 크기가 1MB인 항목에 약 1GB라고 적혀 있으면, 1GB를 잡은 뒤에야 "덜 풀림"으로 `CorruptZipError`가 납니다. 그 메모리를 잡지 못하면 `ZipError`가 아닌 `RangeError`가 그대로 나옵니다.

### 데이터 기술자를 쓴 항목

macOS Finder 같은 도구는 로컬 헤더에 압축 크기를 0으로 적습니다. 그래서 크기는 로컬 헤더가 아니라 목차에서 읽습니다. 반대로 이름과 확장 필드의 길이는 로컬 헤더와 목차가 다를 수 있어서, 데이터 시작 위치는 로컬 헤더의 길이로 계산합니다.

### 낡은 유니코드 경로 필드

유니코드 경로 확장 필드에는 "이 UTF-8 이름은 어떤 원래 이름을 옮긴 것인지"를 CRC로 적어 둡니다. 원래 이름을 나중에 바꾼 ZIP은 이 필드가 옛 이름을 가리킵니다. 그래서 CRC가 지금 이름과 맞을 때만 이 필드를 씁니다.

### CP949 판단

한국어 인코딩 디코더 가운데 일부(Node.js가 쓰는 국제화 라이브러리 ICU 등)는 짝이 맞지 않는 바이트를 오류 없이 버립니다. 그러면 CP437 이름이 CP949로 잘못 읽힙니다. 그래서 디코더에 맡기기 전에 바이트가 CP949의 "앞 바이트 + 뒤 바이트" 짝 규칙에 맞는지 먼저 확인합니다.

### 새로 쓸 때 이어받지 않는 플래그

`raw` 항목은 원본의 플래그 가운데 압축 옵션만 이어받습니다. 원본이 데이터 기술자를 썼더라도 새 ZIP은 데이터 기술자를 쓰지 않으므로, 그 표시를 그대로 가져가면 다른 도구가 새 ZIP을 잘못 읽습니다.

## 한계

쓰기 전에 알아 둘 한계는 다음과 같습니다.

- **암호가 걸린 ZIP과 분할 ZIP은 열지 않습니다.** 지원 범위 밖으로 정했습니다.
- **앞에 다른 바이트가 붙었는데 목차의 위치를 고쳐 쓰지 않은 ZIP은 열지 않습니다.** 자동 실행 압축 파일(프로그램 뒤에 ZIP을 붙인 파일) 가운데 일부가 그런 예입니다. `zip -A` 같은 명령으로 위치를 고쳐 쓴 파일은 열립니다. 위치를 고쳐 쓰지 않은 파일은 이 패키지가 목차에 적힌 위치를 보정하지 않으므로 `CorruptZipError`입니다.
- **Stored와 Deflate만 풉니다.** 나머지 방식은 목록에 나오고 원본 복사도 되지만, 내용을 읽을 수는 없습니다. 실제로 쓰이는 ZIP 대부분은 Deflate입니다.
- **이름 인코딩은 UTF-8, CP949, CP437만 압니다.** 중국어(GBK)나 일본어(Shift-JIS)로 이름을 적은 옛 ZIP은 오류 없이 다른 글자로 읽힙니다.
- **4GB가 넘는 ZIP은 형식상 읽을 수 있지만, 편집은 보장하지 않습니다.** 브라우저 메모리 한계 때문입니다. JavaScript 숫자로 정확히 나타낼 수 없는 크기(약 9PB 초과)는 깨진 ZIP으로 봅니다.
- **수정 시각은 2초 단위이고, 기기의 현지 시각으로 적습니다.** ZIP의 옛 DOS 시각 형식이 그렇습니다. 1980년보다 이른 시각은 1980년 1월 1일로 적습니다. 연도 칸이 7비트라 2107년까지만 적을 수 있어서, 2107년보다 늦은 시각은 2107년 12월 31일 23:59:58로 적습니다.
- **새 ZIP의 이름은 늘 UTF-8입니다.** CP949 이름의 원본을 옮겨도 UTF-8 이름으로 바뀝니다. 요즘 압축 도구는 모두 UTF-8 이름을 읽으므로 문제가 되지 않습니다.

## 테스트

```sh
pnpm --filter @codefold/zip-archive test
```

`writer.test.ts`와 `writer-zip64.test.ts`는 만든 ZIP을 외부 명령 `unzip`(Info-ZIP)으로도 검사합니다. 그래서 테스트를 돌리는 환경에 `unzip`이 설치되어 있어야 합니다. 없으면 이 두 파일의 테스트가 실패합니다.

테스트 파일마다 확인하는 내용은 다음과 같습니다.

| 파일 | 확인하는 것 |
|---|---|
| [central.test.ts](test/central.test.ts) | 목차 읽기: 폴더 항목, 폴더 없는 ZIP, ZIP64, 이름 인코딩, `\` 경로, 데이터 기술자, 암호·분할·ZIP 아님·깨진 구조, 주석 안의 가짜 EOCD, 끝에 붙은 바이트 |
| [names.test.ts](test/names.test.ts) | 파일 이름 읽기: UTF-8 플래그, 표시 없는 UTF-8, NFD → NFC, CP949, CP437, 유니코드 경로 필드와 그 CRC, 짝 없는 CP949 바이트 |
| [archive.test.ts](test/archive.test.ts) | 파일 읽기: 전체·앞부분 읽기, 한 파일만 읽을 때 그 범위만 읽는지, 없는 경로, 지원하지 않는 압축, CRC 오류, 크기보다 더·덜 풀리는 경우, `readRaw` |
| [writer.test.ts](test/writer.test.ts) | ZIP 만들기: 새 파일·폴더, 줄지 않는 내용은 Stored, 원본 복사와 이름 바꾸기, 데이터 기술자 원본 복사, 실행 권한 이어받기, 수정 시각, 같은 경로 두 번 |
| [writer-zip64.test.ts](test/writer-zip64.test.ts) | 65,535개 넘는 항목과 4GB 넘는 크기를 ZIP64로 쓰기 |
| [writer-validation.test.ts](test/writer-validation.test.ts) | 쓸 수 없는 항목(빈 경로, `/`로 끝나는 파일 경로, 65,535바이트 넘는 이름) 거절, 앞이 `/`인 경로는 막지 않음, 폴더 끝 `/` 한 번만 쓰기, 2107년 뒤 시각 |
| [scale.test.ts](test/scale.test.ts) | 1만 개 항목 ZIP을 열 때 파일 끝과 목차만 읽는지 |
| [review-fixes.test.ts](test/review-fixes.test.ts) | 부풀린 크기 거절, Windows 속성 이어받기, 항목 수를 잘못 적은 ZIP |
| [bytes.test.ts](test/bytes.test.ts) | CRC-32 표준 확인값, `blobSource`의 범위 읽기, 오류 class |

샘플 ZIP은 코드로 바이트를 흉내 내 만들지 않고, **실제 압축 도구**(Info-ZIP `zip`, macOS `ditto`, Python `zipfile`)로 만들었습니다. 만드는 스크립트는 [test/fixtures/make-fixtures.sh](test/fixtures/make-fixtures.sh)이고 macOS에서만 실행됩니다. 만든 ZIP은 커밋해 두었으므로 CI에서는 다시 만들지 않습니다.

| 샘플 | 만든 방법 | 확인하는 것 |
|---|---|---|
| `stored.zip`, `deflate.zip` | `zip -0`, `zip` | 두 압축 방식 |
| `no-dir-entries.zip` | `zip -D` | 폴더 항목이 없는 ZIP |
| `zip64-small.zip` | `zip -fz` | 작은데 ZIP64 기록이 붙은 ZIP |
| `encrypted.zip`, `split.zip` | `zip -P`, `zip -s` | 암호 ZIP, 분할 ZIP |
| `macos-ditto.zip` | `ditto` (Finder와 같은 방식) | 표시 없는 UTF-8 이름, 데이터 기술자, `__MACOSX/` |
| `cp949-names.zip`, `cp437-names.zip` | Python | 옛 인코딩 이름 |
| `nfd-names.zip` | Python | 자모로 쪼개진 한글 이름 |
| `backslash-dos.zip` | Python | `\`로 적은 경로 |
| `unicode-path-extra.zip` | Python | 유니코드 경로 확장 필드 |
| `utf8-flag.zip` | Python | UTF-8 플래그 |
| `bzip2.zip` | Python | 지원하지 않는 압축 방식 |

## 관련 결정 기록

왜 이렇게 설계했는지는 아래 문서에 있습니다.

- [ADR-0001](../../docs/adr/0001-zip-parser-in-house.md): ZIP 파서를 직접 만들고, 압축은 브라우저 내장 기능을 쓰기로 한 결정. 지원 범위와 이름 인코딩 순서
- [ADR-0016](../../docs/adr/0016-workspace-layer-and-ports.md): 연 ZIP을 `FileSource` 모양으로 `virtual-fs`에 넘기는 구조
- [ADR-0017](../../docs/adr/0017-factory-interfaces-and-plain-data.md): 항목 정보를 순수 객체로, 오류를 `Error` 하위 class로 만든 규칙
- [ADR-0028](../../docs/adr/0028-zip-work-in-web-worker.md): ZIP 작업을 Web Worker에서 하기로 한 결정
- [ADR-0032](../../docs/adr/0032-export-write-keeps-original-path.md): 고친 파일이 원래 속성을 이어받도록 원래 경로를 적는 결정
- [ADR-0033](../../docs/adr/0033-export-keeps-empty-directories.md): 다운로드 ZIP에 빈 폴더를 폴더 항목으로 남기는 결정
- [ADR-0037](../../docs/adr/0037-zip-name-decoding-and-blob-write.md): 이름 읽기에 유니코드 경로 확장 필드 단계를 넣고, 새 ZIP을 조각을 이어 붙인 Blob으로 만드는 결정
- [ADR-0038](../../docs/adr/0038-zip-slip-entries-exported-unchanged.md): `..`이 든 항목을 경고 없이 내려받은 ZIP에 원본 그대로 넣는 결정
