# @codefold/virtual-fs

ZIP 같은 **파일 묶음을 폴더 트리로 보여 주고, 그 위에서 파일을 추가·삭제·이름 변경할 수 있게 하는** 패키지입니다. 원본은 건드리지 않고 바뀐 내용만 기록해 두었다가, 다운로드할 때 "새 ZIP에 무엇을 어떻게 넣을지" 목록을 만들어 줍니다.

## 목차

- [왜 필요한가](#왜-필요한가)
- [먼저 알아 둘 개념](#먼저-알아-둘-개념)
- [한눈에 보는 사용 흐름](#한눈에-보는-사용-흐름)
- [트리를 만드는 과정](#트리를-만드는-과정)
- [추가·삭제·이름 변경](#추가삭제이름-변경)
- [이름 검사](#이름-검사)
- [변경 기록과 복원](#변경-기록과-복원)
- [내보내기 계획](#내보내기-계획)
- [오류](#오류)
- [쓰는 쪽이 꼭 처리해야 할 것](#쓰는-쪽이-꼭-처리해야-할-것)
- [상황별 결과](#상황별-결과)
- [API 레퍼런스](#api-레퍼런스)
- [성능](#성능)
- [한계](#한계)
- [테스트](#테스트)
- [관련 결정 기록](#관련-결정-기록)

## 왜 필요한가

ZIP 안의 파일 목록은 폴더 구조가 아니라 **경로를 한 줄로 늘어놓은 목록**입니다.

```
src/main.py
src/utils/helper.py
data/input.txt
```

그런데 에디터의 파일 목록은 폴더를 펼치고 접는 트리로 보여야 하고, 사용자는 그 트리에서 파일을 새로 만들거나 지우거나 이름을 바꿉니다. 이때 두 가지 문제가 생깁니다.

- **ZIP 파일은 조작할 때마다 다시 쓰기 어렵습니다.** ZIP 파일의 바이트를 매번 다시 쓰면 느리고, 원본이 망가질 위험도 있습니다.
- **이름을 바꾼 파일도 원본을 읽을 수 있어야 합니다.** `main.py`를 `app.py`로 바꿨다면, 화면에서는 `app.py`로 보이지만 내용은 ZIP 안의 `main.py`에서 읽어야 합니다.

이 패키지는 원본 목록 위에 **가상의 트리**를 하나 더 둡니다. 사용자의 조작은 이 트리에만 반영하고, 각 파일이 원본의 어느 항목에서 왔는지를 기억합니다. 다운로드할 때는 "이 파일은 원본을 새 이름으로 복사, 이 파일은 새 내용으로 쓰기, 이 폴더는 빈 폴더로 남기기" 같은 목록을 만들어 줍니다. 실제 ZIP을 만드는 일은 이 목록을 받은 `@codefold/zip-archive`가 합니다.

이 패키지의 특징은 다음과 같습니다.

- 외부 라이브러리가 없습니다.
- ZIP 형식에 기대지 않습니다. 파일 목록과 읽기 함수만 넘기면 ZIP이 아닌 다른 출처에도 쓸 수 있습니다.
- 트리를 만들 때 파일 내용을 읽지 않습니다. 5만 개 항목으로 트리를 만드는 데 Node.js에서 약 130~450ms가 걸립니다([성능](#성능) 참고).
- 돌려주는 값은 모두 메서드 없이 값만 든 객체라서 Web Worker로 보내거나 저장해도 깨지지 않습니다.

## 먼저 알아 둘 개념

이 문서에 자주 나오는 용어를 먼저 풀어 둡니다.

### 파일 출처(FileSource)

**파일 출처**는 이 패키지가 원본 파일을 가져오는 곳입니다. 세 가지 함수만 있으면 됩니다.

| 함수 | 하는 일 |
|---|---|
| `list()` | 원본에 든 항목 목록을 돌려줍니다. 항목마다 경로, 폴더인지 여부, 크기가 있습니다. |
| `readHead(path, bytes)` | 파일의 앞부분을 돌려줍니다. 파일 종류를 판단할 때 씁니다. |
| `readAll(path)` | 파일 전체를 돌려줍니다. |

`@codefold/zip-archive`의 `openZip`이 돌려주는 객체가 이 모양을 그대로 갖추고 있어서, 연 ZIP을 바로 넘길 수 있습니다. 두 패키지는 서로를 import하지 않고, 주고받는 객체의 형태만 같게 맞춥니다.

### 원본 경로와 트리 경로

한 파일에는 경로가 두 개 있습니다.

- **원본 경로**: 파일 출처의 목록에 적힌 경로입니다. ZIP 안의 이름 그대로이며, 이 패키지는 이 값을 바꾸지 않습니다.
- **트리 경로**: 사용자가 화면에서 보는 경로입니다. 이름을 바꾸면 트리 경로만 바뀝니다.

`main.py`를 `app.py`로 바꾸면 트리 경로는 `app.py`, 원본 경로는 여전히 `main.py`입니다. `readAll('app.py')`를 부르면 이 패키지가 원본 경로 `main.py`로 파일 출처를 읽어 줍니다. 쓰는 쪽은 원본 경로를 따로 기억할 필요가 없습니다.

새로 만든 파일은 원본이 없으므로 원본 경로가 없습니다.

### 트리와 노드

트리를 이루는 항목 하나하나를 **노드**라고 부릅니다. 파일도 폴더도 노드입니다. 노드에는 트리 경로(`path`), 이름(`name`), 폴더인지 여부(`isDirectory`), 크기(`size`)가 있습니다.

모든 항목을 담는, 화면에는 나오지 않는 맨 위 폴더를 **최상위 폴더**라고 하고, 경로는 빈 문자열(`''`)입니다. `children('')`을 부르면 트리 맨 위 단계에 보이는 항목이 나옵니다.

### 숨긴 항목

원본 목록에는 트리에 보여 주면 안 되거나 보여 줄 필요가 없는 항목이 섞여 있습니다. 이런 항목은 트리에서 빼되, **다운로드할 ZIP에는 원본 그대로 다시 넣습니다.** 사용자가 보지 못한 항목이 다운로드한 ZIP에서 몰래 사라지면 안 되기 때문입니다. 이 문서에서는 이런 항목을 **숨긴 항목**이라고 부릅니다.

예외가 둘 있습니다. 첫째, 빈 경로의 폴더 항목은 넣지 않습니다(아래 표). 둘째, 트리에 보이는 폴더 안의 숨긴 항목은 그 폴더를 지우면 함께 빠지고, 이름을 바꾸면 함께 옮겨집니다. 자세한 규칙은 [숨긴 항목이 따라가는 규칙](#숨긴-항목이-따라가는-규칙)에 있습니다.

| 종류 | 예 | 트리에서 빼는 이유 |
|---|---|---|
| 무시 목록 | `__MACOSX/…`, `.DS_Store`, `._main.py` | macOS가 압축할 때 자동으로 넣는 부가 파일이라 사용자에게 의미가 없습니다. |
| 위험한 경로 | `../evil.sh`, `a/../../b` | `..`은 "상위 폴더"라는 뜻이라, 풀었을 때 ZIP 바깥에 파일이 생길 수 있습니다. |
| 빈 경로 | `/`, `./` | 정리하고 나면 이름이 남지 않습니다. 폴더 항목이면 다운로드한 ZIP에서도 빠집니다. 가리킬 폴더 이름이 없기 때문입니다. |
| 겹친 경로 | `/a.txt`와 `a.txt`가 둘 다 있음 | 정리하면 같은 경로가 되어 둘 다 보여 줄 수 없습니다. 목록에서 나중에 나온 항목만 트리에 보입니다. |
| 파일·폴더 충돌 | 파일 `a`와 파일 `a/b.txt`가 둘 다 있음 | 같은 경로가 파일이면서 폴더일 수는 없습니다. 폴더를 트리에 둡니다. |

### 구조 버전

**구조 버전**은 트리 구조가 바뀔 때마다 1씩 오르는 숫자입니다. 처음은 0이고, 추가·삭제·이름 변경을 할 때마다 오릅니다. 화면 코드가 이 숫자 하나만 비교해 "트리가 바뀌었는지" 알 수 있게 하려고 둡니다. 파일 내용을 고치는 것은 구조 변경이 아니므로 버전이 오르지 않습니다.

### 변경 기록

추가·삭제·이름 변경은 하나하나 **변경 기록**으로 쌓입니다.

```ts
{ type: 'add', path: 'src/new.py', isDirectory: false }
{ type: 'rename', from: 'src/main.py', to: 'src/app.py' }
{ type: 'delete', path: 'data' }
```

이 기록을 저장해 두었다가, 나중에 같은 원본 위에 순서대로 다시 적용하면 똑같은 트리가 나옵니다. 브라우저를 새로고침해도 작업을 이어 갈 수 있는 이유입니다.

### 내보내기 계획

**내보내기 계획**은 다운로드할 ZIP에 넣을 항목 목록입니다. 항목은 세 종류입니다.

| 종류 | 뜻 |
|---|---|
| `copy` | 원본 항목(`originalPath`)을 압축된 그대로 `path` 이름으로 복사합니다. 안 고친 파일입니다. |
| `write` | 새 내용을 `path`에 씁니다. 고친 파일과 새로 만든 파일입니다. 원본에서 온 파일이면 `originalPath`가 있어 원래 속성(실행 권한 등)을 이어받을 수 있습니다. |
| `directory` | 빈 폴더를 남깁니다. |

## 한눈에 보는 사용 흐름

```
① 만들기        createVirtualFs(파일 출처)       → 트리 (파일 내용은 안 읽음)
② 보여 주기     children(경로), getNode(경로)    → 정렬한 자식 목록, 노드 하나
③ 조작하기      add / delete / rename           → 트리만 바뀜, 원본은 그대로
④ 읽기          readHead / readAll(트리 경로)    → 원본 경로로 읽어 줌
⑤ 저장하기      changes()                       → 변경 기록 (새로고침한 뒤 복원용)
⑥ 내려받기      exportEntries(고친 파일 경로들)  → 내보내기 계획
```

코드로 쓰면 다음과 같습니다.

```ts
import { openZip } from '@codefold/zip-archive';
import { createVirtualFs } from '@codefold/virtual-fs';

// ① 연 ZIP을 파일 출처로 넘긴다. 목록만 읽고 트리를 만든다.
const zip = await openZip(uploadedFile);
const fs = await createVirtualFs(zip);

// ② 맨 위 항목부터 보여 준다. 폴더가 먼저, 이름은 자연 정렬 순서다(file2가 file10보다 앞).
for (const node of fs.children('')) {
  console.log(node.isDirectory ? '📁' : '📄', node.name);
}

// ③ 사용자가 트리에서 조작한다.
fs.add('src', 'new.py', false);          // 새 파일
fs.rename('src/main.py', 'app.py');      // 이름 변경 (같은 폴더 안에서만)
fs.delete('data');                       // 폴더를 안의 항목과 함께 삭제

// ④ 이름을 바꾼 파일도 트리 경로로 읽는다. 안에서 원본 경로 src/main.py를 읽는다.
const bytes = await fs.readAll('src/app.py');

// ⑤ 변경 기록을 저장해 둔다. 새로고침한 뒤 같은 ZIP으로 다시 만들 때 넘긴다.
saveSomewhere(fs.changes());
const restored = await createVirtualFs(zip, { changes: loadFromSomewhere() });

// ⑥ 내려받을 때: 내용을 고친 파일의 트리 경로를 넘기면 계획이 나온다.
const plan = fs.exportEntries(new Set(['src/app.py']));
// [{ type: 'write', path: 'src/app.py', originalPath: 'src/main.py' },
//  { type: 'copy', path: 'src/utils/helper.py', originalPath: 'src/utils/helper.py' },
//  { type: 'write', path: 'src/new.py' }]
```

새로 만든 `src/new.py`는 원본에서 온 항목 뒤에 옵니다. 지운 `data/input.txt`는 들어가지 않습니다.

`uploadedFile`, `saveSomewhere`, `loadFromSomewhere`는 예시일 뿐입니다. 쓰는 쪽이 준비합니다.

## 트리를 만드는 과정

`createVirtualFs`는 파일 출처의 `list()`를 한 번 부르고, 항목마다 다음을 합니다. 파일 내용은 읽지 않습니다.

1. **경로를 정리합니다.** 맨 앞의 `/`, `/` 사이가 빈 조각(`a//b`), `.`만 있는 조각(`./src`)을 없앱니다. `./src/a.ts`는 `src/a.ts`가 됩니다.
2. **숨길지 정합니다.** [숨긴 항목](#숨긴-항목)에 해당하면 트리에 넣지 않고, 내보낼 때 원본 그대로 넣도록 따로 기억합니다.
3. **폴더를 만들어 냅니다.** ZIP에는 폴더 항목이 따로 없는 경우가 많습니다. `src/utils/helper.py`만 있어도 `src`와 `src/utils` 폴더를 트리에 만듭니다. 무시 목록에 든 항목(`.DS_Store` 등)만 있는 폴더도 만듭니다. `foo/` 폴더 항목 없이 `foo/.DS_Store`만 있어도, 풀면 `foo` 폴더가 생기기 때문입니다. 이 `foo`는 트리에 빈 폴더로 보입니다. `__MACOSX/` 아래 항목으로는 폴더를 만들지 않습니다.
4. **같은 원본 경로가 여러 번 나오면 마지막 항목만 씁니다.** `zip-archive`도 같은 경로가 여럿이면 마지막 항목을 읽으므로, 트리에 보이는 파일과 실제로 읽히는 파일을 같게 맞춘 것입니다. 앞 항목은 트리에도, 다운로드한 ZIP에도 넣지 않습니다. `zip-archive`는 경로로 항목을 찾으므로, 앞 항목을 복사하려 해도 뒤 항목이 두 번 들어가기 때문입니다. `/a.txt`와 `a.txt`처럼 **정리한 뒤에만** 같아지는 경로는 다르게 처리합니다. 이때는 둘 다 다운로드한 ZIP에 남습니다.

이 패키지는 원본 경로의 이름을 NFC(자모로 쪼개진 한글을 한 글자로 합친 형태)로 바꾸지 않습니다. `zip-archive`의 `openZip`은 이름을 이미 NFC로 바꿔 넘기므로, 연 ZIP을 넘기면 트리 경로도 NFC입니다. `openZip`을 거치지 않고 이름을 NFC로 바꾸지 않는 다른 출처에서 경로를 받으면, 자모로 쪼개진 한글 이름이 트리 경로에도 쪼개진 그대로 들어갑니다.

### 정렬 순서

`children()`은 늘 같은 규칙으로 정렬한 목록을 돌려줍니다.

- **폴더가 먼저, 파일이 나중**입니다.
- 이름은 **자연 정렬**입니다. 숫자를 숫자로 비교해서 `file2`가 `file10`보다 앞에 옵니다. 한글은 가나다순입니다.
- 대소문자만 다른 이름처럼 비교 결과가 같게 나오면 문자 코드 순서로 가릅니다. 그래서 몇 번을 불러도 같은 순서가 나옵니다.

`children()`은 그 폴더의 구조가 바뀌기 전까지 **같은 배열**을 돌려줍니다. 그래서 부를 때마다 다시 정렬하지 않습니다. `useSyncExternalStore`처럼 값이 같은지 비교하는 구독에서도, 바뀌지 않은 폴더는 바뀌지 않은 값으로 보입니다. react-code-editor의 파일 트리는 `children()`을 구독하지 않고, 구조 버전이 바뀌면 펼친 폴더의 `children()`을 다시 읽어 화면에 그릴 줄 목록을 새로 만듭니다. 없는 경로나 파일 경로를 넘기면 늘 같은 빈 배열이 나옵니다.

## 추가·삭제·이름 변경

세 조작은 모두 트리만 바꾸고 원본은 건드리지 않습니다. 성공하면 구조 버전이 1 오르고, 변경 기록이 하나 쌓이며, `onDidChange`로 등록해 둔 함수(구독자)를 부릅니다. 실패하면 오류를 던지고 아무것도 바뀌지 않습니다.

### `add(parentPath, name, isDirectory)`

`parentPath` 폴더 안에 새 파일이나 폴더를 만들고, 만든 노드를 돌려줍니다.

- 이름은 NFC로 바꿔 씁니다. NFC는 한글처럼 조합되는 글자를 한 글자로 합친 형태입니다. macOS에서 입력한 한글이 자모로 쪼개져 들어와도 같은 이름으로 다룹니다.
- 새 파일은 원본이 없어서 읽으면 빈 바이트가 나오고, 크기는 0입니다.
- 쓸 수 없는 이름이면 `InvalidNameError`입니다. 이유는 [이름 검사](#이름-검사)에 있습니다.

### `delete(path)`

파일이나 폴더를 지웁니다. 폴더면 안의 항목도 모두 지웁니다. 지운 노드 전체를 **부모 먼저** 순서로 돌려줍니다. 에디터가 지운 파일의 탭을 닫을 때 이 목록을 씁니다.

폴더 안에 있던 숨긴 항목(`.DS_Store`, `._*` 등)도 함께 빠집니다. 사용자가 폴더를 지웠는데 다운로드한 ZIP에 그 폴더의 부가 파일만 남으면 이상하기 때문입니다. 어떤 숨긴 항목이 빠지는지는 [숨긴 항목이 따라가는 규칙](#숨긴-항목이-따라가는-규칙)에 있습니다.

### `rename(path, newName)`

**같은 폴더 안에서** 이름을 바꿉니다. 다른 폴더로 옮기는 기능은 없습니다. 경로가 바뀐 항목 전체를 `{ from, to, isDirectory }` 목록으로 돌려주며, 순서는 부모가 먼저입니다. 에디터가 열린 탭의 경로를 새 경로로 바꿀 때 씁니다.

- 폴더 이름을 바꾸면 안의 항목도 모두 새 경로로 옮깁니다. 폴더 안의 숨긴 항목도 함께 옮깁니다.
- 원본 경로는 바뀌지 않습니다. 이름을 바꾼 파일도 원본을 읽고, 내려받을 때는 원본을 새 이름으로 복사합니다.
- 새 이름도 `add`처럼 NFC로 바꿔 씁니다.
- 같은 이름으로 바꾸면 아무것도 하지 않고 빈 목록을 돌려줍니다. 구조 버전도 오르지 않습니다.
- 대소문자만 바꾸는 것은 됩니다(`readme.md` → `README.md`).

### 숨긴 항목이 따라가는 규칙

숨긴 항목 가운데 트리에 보이는 폴더에 딸린 것은 그 폴더를 따라갑니다. 폴더를 지우면 함께 빠지고, 폴더 이름을 바꾸면 함께 옮겨집니다. 트리 폴더 안의 `.DS_Store`·`._*`, 경로가 겹쳐 숨긴 파일, 파일·폴더 충돌로 숨긴 파일이 여기에 해당합니다.

- **지울 때:** 지운 경로와 같거나 그 아래에 있는 숨긴 항목도 다운로드한 ZIP에서 빠집니다. 파일 `a.txt`를 지우면 겹쳐서 숨긴 `/a.txt`도 빠지고, 폴더 `a`를 지우면 충돌로 숨긴 파일 `a`도 빠집니다. 그래야 나중에 같은 이름으로 새로 만든 항목이 다운로드한 ZIP에서 숨긴 항목과 겹치지 않습니다. `foo/.DS_Store`만 있어서 빈 폴더로 보이는 `foo`를 지워도, `foo/.DS_Store`가 함께 빠집니다.
- **이름을 바꿀 때:** 폴더 **아래**의 숨긴 항목만 새 경로로 옮깁니다. 파일 `a.txt`의 이름을 바꿔도 `/a.txt`는 그 자리에 남습니다. 그래서 이름을 바꾼 뒤에는 트리에 `a.txt`가 없어도 `a.txt`를 새로 만들 수 없습니다(`duplicate`).
- `__MACOSX/` 아래 항목, `..`이 든 항목, 빈 경로 항목은 어느 폴더도 따라가지 않습니다. 늘 원본 경로 그대로 다운로드한 ZIP에 들어갑니다. 다만 빈 경로의 폴더 항목은 넣지 않습니다. `__MACOSX/` 아래 항목은 경로의 첫 조각이 정확히 `__MACOSX`인 항목만 뜻합니다. `__MACOSX_old/`처럼 이름이 `__MACOSX`로 시작할 뿐인 폴더는 보통 폴더라서, 그 안의 `.DS_Store`는 폴더를 따라갑니다.
- `delete`·`rename`이 돌려주는 목록에는 트리 노드만 들어 있고, 숨긴 항목은 없습니다.

이 규칙을 정한 이유는 [ADR-0036](../../docs/adr/0036-hidden-entries-follow-tree-folders.md)에 있습니다.

### 알림 시점

`add`·`delete`·`rename`은 값을 돌려주기 전에 `onDidChange` 구독자를 **바로(동기로)** 부릅니다. 이때 트리는 이미 바뀌었지만, 쓰는 쪽은 아직 돌려받은 목록으로 탭과 model을 옮기지 못한 상태입니다.

그래서 구독자 안에서는 트리 값(`children`, `structureVersion` 등)만 읽으세요. model·탭까지 모두 옮긴 뒤의 알림이 필요하면, 조작을 부른 쪽에서 정리를 마친 다음에 직접 알리세요. react-code-editor의 `onTreeChange`가 이렇게 합니다.

구독자 목록은 알림을 보내기 직전에 복사해 둡니다. 그래서 알림 도중에 어떤 구독자가 `dispose()`해도, 그 구독자는 이번 알림을 받습니다.

## 이름 검사

새로 만들거나 이름을 바꾸기 전에, 입력칸에서 미리 "이 이름을 쓸 수 있는지" 물어볼 수 있습니다.

```ts
fs.validateNewName('src', 'main.py');    // 'duplicate' — 이미 있음
fs.validateRename('src/a.py', 'b.py');   // undefined — 써도 됨
```

쓸 수 있으면 `undefined`, 없으면 이유를 돌려줍니다. 입력칸 아래에 이유별 안내 문구를 보여 줄 때 씁니다.

| 이유 | 뜻 | 예 |
|---|---|---|
| `'empty'` | 비어 있거나 공백뿐입니다. | `''`, `'   '` |
| `'reserved'` | 경로에서 특별한 뜻이 있는 이름입니다. | `'.'`, `'..'` |
| `'invalid-character'` | 쓸 수 없는 문자가 들어 있습니다. 경로 구분자와 제어 문자입니다. | `'a/b'`, `'a\b'`, 줄바꿈이 든 이름 |
| `'duplicate'` | 같은 폴더에 같은 이름이 있습니다. | 아래 설명 참고 |

**중복은 대소문자와 NFC 차이를 무시하고 봅니다.** `README.md`가 있는 폴더에 `readme.md`를 만들 수 없습니다. 다운로드한 ZIP을 macOS나 Windows에서 풀면 두 이름이 같은 파일이 되어 하나가 사라지기 때문입니다.

**숨긴 항목과 겹쳐도 중복입니다.** 새 경로가 어떤 숨긴 항목의 경로와 같거나, 새 경로 아래에 숨긴 항목이 있으면 `duplicate`입니다. `__MACOSX/` 아래 항목을 포함해 모든 숨긴 항목을 봅니다. 비교는 여기서도 대소문자와 NFC 차이를 무시합니다.

- `src/.DS_Store`가 있으면 `src` 안에 `.DS_Store`나 `.ds_store`를 만들 수 없습니다. 다운로드한 ZIP에 같은 경로가 두 번 들어가기 때문입니다.
- 원본에 `__MACOSX/._a`가 있으면 최상위에 `__MACOSX`(대소문자만 다른 `__macosx` 포함)를 만들 수 없습니다. 파일로 만들면 다운로드한 ZIP에서 같은 경로가 파일이면서 폴더가 됩니다. 폴더로 만들면 트리의 항목과 숨긴 항목이 한 폴더에 섞여, 같은 경로가 두 번 들어갈 수 있습니다.
- 파일 `a.txt`의 이름을 바꾸면 겹쳐서 숨긴 `/a.txt`는 그 자리에 남습니다. 그래서 그 뒤에는 `a.txt`를 새로 만들 수 없습니다.

폴더 이름을 바꿀 때는 그 폴더 안의 숨긴 항목을 중복 검사에서 뺍니다. 그 항목은 폴더와 함께 옮겨지기 때문입니다. 그래서 `.DS_Store`가 든 `src`를 `SRC`로 바꿀 수 있습니다.

`.gitignore`, `...`, 앞에 공백이 있는 이름은 쓸 수 있습니다. 두 검사 함수도 입력을 NFC로 바꾼 뒤에 봅니다.

## 변경 기록과 복원

브라우저를 새로고침하면 메모리의 트리가 사라집니다. 이 패키지는 트리 자체를 저장하는 대신 **변경 기록**을 저장하게 합니다. 원본 목록과 변경 기록만 있으면 트리를 똑같이 다시 만들 수 있고, 변경 기록은 트리 전체보다 훨씬 작습니다.

```ts
// 저장할 때
const saved = fs.changes(); // TreeChange[] — 순수 데이터라 IndexedDB에 그대로 넣을 수 있다

// 복원할 때: 같은 원본으로 만들고 변경을 순서대로 다시 적용한다
const fs2 = await createVirtualFs(zip, { changes: saved });
fs2.structureVersion(); // saved.length와 같다
```

변경 기록과 구조 버전에는 다음 성질이 있습니다.

- **복원한 뒤의 `changes()`에는 다시 적용한 기록이 들어 있습니다.** 저장할 때는 늘 `changes()` 전체로 덮어쓰세요. 이어 붙이면 기록이 두 번 들어갑니다.
- **기록은 합치지 않습니다.** 파일을 만들었다가 지우면 기록 2개가 남고 구조 버전은 2입니다. 구조 버전은 "원본과 다른가"가 아니라 "몇 번 바꿨나"를 셉니다. 트리가 원본과 같아져도 0으로 돌아가지 않습니다.
- **`changes()[i]`를 적용한 뒤의 구조 버전은 늘 `i + 1`입니다.** 복원 직후 monaco-binding의 변경 추적기(`tracker`)에 기록을 다시 알릴 때 이 규칙을 씁니다. react-code-editor는 `fs.changes().forEach((change, i) => tracker.recordTreeChange(change, i + 1))`로 알립니다.

다시 적용하다 실패하면 `ReplayError`를 던집니다. 저장본이 지금 원본과 맞지 않는다는 뜻입니다. 다른 ZIP으로 만든 저장본을 불러왔거나, 지운 파일을 다시 지우려는 기록이 들어 있는 경우입니다. 틀린 트리를 조용히 만들지 않고 알려 줍니다. 쓰는 쪽은 복원을 멈추고 사용자에게 알리세요. 저장본은 저절로 지우지 않습니다. 이 프로젝트에서는 "다시 시도"와 "버리기"를 고르게 하고, "버리기"를 골랐을 때만 저장본을 지웁니다.

다시 적용하는 동안에는 구독자가 아직 없으므로 `onDidChange` 알림이 가지 않습니다.

## 내보내기 계획

`exportEntries(written)`은 다운로드할 ZIP에 넣을 항목 목록을 만듭니다. `written`에는 **내용이 원본과 달라진 파일의 트리 경로**를 넘깁니다. 어떤 파일의 내용이 바뀌었는지는 이 패키지가 모르기 때문입니다. 파일 내용은 에디터(Monaco)가 관리합니다.

항목은 다음 규칙으로 정합니다.

| 트리의 상태 | 계획 항목 |
|---|---|
| 원본에서 온 파일, 내용 그대로 | `copy` (이름을 바꿨으면 새 이름으로) |
| 원본에서 온 파일, 내용이 바뀜(`written`에 있음) | `write` + `originalPath` |
| 새로 만든 파일 | `write` (`written`에 넣지 않아도 들어감, `originalPath` 없음) |
| 지운 파일 | 넣지 않음 |
| 안에 아무것도 없는 폴더 | `directory` |
| 파일이 든 폴더 | 넣지 않음 (파일 경로가 폴더를 만들어 줌) |
| 숨긴 항목 | 파일은 `copy`(`originalPath`는 늘 원본 경로), 폴더는 `directory`(원본 경로 끝의 `/`를 뗀 경로). 들어 있던 폴더의 이름을 바꿨으면 `path`는 새 경로입니다. 들어 있던 폴더를 지웠으면 넣지 않습니다([숨긴 항목이 따라가는 규칙](#숨긴-항목이-따라가는-규칙)). |

알아 둘 점은 다음과 같습니다.

- **순서는 원본 목록을 따릅니다.** 원본에서 온 항목은 원본 순서대로, 새로 만든 항목은 만든 순서대로 그 뒤에 옵니다. 이름을 바꾼 항목도 원본에 있던 자리에 그대로 옵니다. 그래서 다운로드한 ZIP을 원본과 비교하기 쉽습니다.
- **폴더 이름을 바꾼 뒤 안의 파일을 고쳐도 `originalPath`가 남습니다.** 그래서 셸 스크립트의 실행 권한이 이어집니다.
- **지운 뒤 같은 이름으로 새로 만든 파일은 새 파일입니다.** `originalPath`가 없고, 원본 내용을 읽지도 않습니다.
- **무시 목록 항목만 든 폴더는 `directory`로 넣지 않습니다.** 그 항목을 원본 경로 그대로 넣으면 폴더도 함께 생기기 때문입니다.
- **`directory` 항목의 경로 끝에는 `/`가 없습니다.** 숨긴 폴더 항목(`__MACOSX/` 등)도 끝의 `/`를 떼고 냅니다. 계획을 받는 쪽(`zip-archive`)은 `/`를 한 번만 붙이면 됩니다. `../x/`처럼 `..`이 든 폴더 항목도 이렇게 끝의 `/`만 떼고, 걸러 내지 않고 그대로 냅니다([ADR-0038](../../docs/adr/0038-zip-slip-entries-exported-unchanged.md)).
- **`written`에 새로 만든 파일을 넣어도 됩니다.** 오류 없이 `originalPath` 없는 `write`로 나옵니다.
- **`written`은 `exportEntries`를 부르는 순간의 트리로 검사합니다.** 트리에 없는 경로가 있으면 `PathNotFoundError`입니다.
- 계획은 순수 데이터라 `postMessage`로 Worker에 그대로 보낼 수 있습니다.

### 예: 이름 변경·수정·삭제·추가를 한 뒤의 계획

원본 목록이 다음과 같다고 합시다.

```
scripts/run.sh
scripts/.DS_Store
src/main.py
src/utils/helper.py
data/input.txt
logs/                      (빈 폴더 항목)
__MACOSX/src/._main.py
```

사용자가 다음처럼 조작하고, 에디터에서 `bin/run.sh`를 고쳤습니다.

```ts
fs.rename('scripts', 'bin');
// → [{ from: 'scripts', to: 'bin', isDirectory: true },
//    { from: 'scripts/run.sh', to: 'bin/run.sh', isDirectory: false }]
//   숨긴 항목 scripts/.DS_Store는 목록에 없지만 함께 옮겨진다.
fs.rename('src/main.py', 'app.py');
fs.delete('data');               // → data, data/input.txt 노드
fs.add('src', 'new.py', false);
fs.add('', 'docs', true);

fs.structureVersion();           // 5
fs.exportEntries(new Set(['bin/run.sh']));
```

계획은 다음 순서로 나옵니다.

| 항목 | 이유 |
|---|---|
| `write bin/run.sh` (`originalPath: 'scripts/run.sh'`) | 고친 파일입니다. 폴더 이름을 바꿔도 원래 경로가 남아 실행 권한을 이어받습니다. |
| `copy bin/.DS_Store` (`originalPath: 'scripts/.DS_Store'`) | 숨긴 항목이 폴더를 따라 새 경로로 옮겨졌습니다. |
| `copy src/app.py` (`originalPath: 'src/main.py'`) | 이름만 바꾼 파일입니다. 원본을 새 이름으로 복사합니다. |
| `copy src/utils/helper.py` | 안 고친 파일입니다. |
| `directory logs` | 원본의 빈 폴더입니다. |
| `copy __MACOSX/src/._main.py` | `__MACOSX/` 아래 항목은 폴더를 따라가지 않아 원본 경로 그대로입니다. |
| `write src/new.py` | 새 파일입니다. `written`에 없어도 들어갑니다. |
| `directory docs` | 새로 만든 빈 폴더입니다. |

지운 `data/input.txt`는 들어가지 않습니다. 새로 만든 항목은 원본 항목 뒤에, 만든 순서대로 옵니다.

## 오류

이 패키지가 직접 만드는 오류는 모두 `VirtualFsError`를 상속합니다. 파일 출처(`list`·`readHead`·`readAll`)가 던진 오류는 감싸지 않고 그대로 전달합니다. 예를 들어 ZIP이 손상됐다면 `zip-archive`의 오류가 그대로 옵니다. `readHead`·`readAll`은 비동기라서, 아래 오류도 던지지 않고 거부된 Promise로 돌려줍니다.

| 오류 | 언제 나오나 | 담긴 값 |
|---|---|---|
| `PathNotFoundError` | 트리에 없는 경로입니다. 최상위 폴더(`''`)를 지우거나 이름을 바꾸려 해도 이 오류입니다. | `path` |
| `NotADirectoryError` | 파일 안에 항목을 만들려 했습니다. | `path` |
| `NotAFileError` | 폴더를 파일처럼 읽거나, `written`에 폴더를 넣었습니다. | `path` |
| `InvalidNameError` | 쓸 수 없는 이름입니다. | `invalidName`, `problem` (이유) |
| `ReplayError` | 저장된 변경을 다시 적용하지 못했습니다. | `index` (몇 번째 변경인지. 0부터 셉니다), `change`, `cause` (원래 오류). 오류 메시지는 사람이 읽으므로 1부터 셉니다(`index`가 1이면 "2번째"). |
| `VirtualFsError` | 저장된 이름 변경 기록이 항목을 다른 폴더로 옮기려 합니다. 다시 적용할 때만 나오며, `ReplayError`의 `cause`로 감싸집니다. | |

## 쓰는 쪽이 꼭 처리해야 할 것

이 패키지는 트리 구조만 다룹니다. 아래 다섯 가지는 쓰는 쪽이 맡아야 합니다.

### 1. 파일 내용은 따로 관리합니다

이 패키지는 파일 내용을 저장하지 않습니다. 고친 내용은 에디터가 가지고 있습니다(이 프로젝트에서는 파일마다 내용을 담는 Monaco의 model 객체). 내려받을 때는 쓰는 쪽이 거기서 내용을 가져와 `write` 항목을 채웁니다. 그래서 `exportEntries`에 "어떤 파일이 바뀌었는지"(`written`)를 넘겨야 합니다.

- 계획의 `write` 항목에는 모두 바이트를 채워야 합니다. `written`에 넣지 않은 새 파일도 `write`로 나오므로, 그 파일의 내용(보통 빈 내용)을 넣으세요.
- 고친 파일 목록(monaco-binding의 `registry.dirtyPaths()`)을 그대로 넘겨도 됩니다. 더 줄이려면 다시 인코딩한 바이트가 원본과 같은 파일을 목록에서 빼세요. 그 파일은 `copy`로 나와 원본의 압축된 바이트를 그대로 씁니다. react-code-editor가 이렇게 합니다.
- `written`을 만든 뒤 `await`를 거쳤다면, 그 사이에 구조 버전이 바뀌었는지 확인하세요. 바뀌었으면 `written`부터 다시 만듭니다. 그사이 이름이 바뀐 경로가 있으면 `exportEntries`가 `PathNotFoundError`를 던지기 때문입니다.

### 2. 삭제·이름 변경의 결과로 열린 파일을 정리합니다

`delete`·`rename`이 돌려준 목록에는 폴더도 들어 있습니다. 파일(`isDirectory: false`)마다 탭을 닫거나 옮기고, monaco-binding의 `registry.remove(path)`·`registry.rename(from, to)`를 부르세요. 파일을 모두 처리한 뒤, 이 트리 변경 하나에 대해 `tracker.recordTreeChange(change, fs.structureVersion())`를 한 번 부릅니다.

```ts
const moved = fs.rename('src', 'lib');
for (const { from, to, isDirectory } of moved) {
  if (isDirectory) continue;
  registry.rename(from, to);
  area.rename(from, to); // 열린 탭을 새 경로로 바꾼다 (쓰는 쪽의 탭 영역)
}
tracker.recordTreeChange({ type: 'rename', from: 'src', to: 'lib' }, fs.structureVersion());
```

`readAll`·`readHead`는 부르는 순간의 트리로 경로를 찾고, 그다음에는 원본 경로로 읽습니다. 그래서 읽는 도중에 이름을 바꾸거나 지워도 읽기는 성공합니다. 읽기가 끝났을 때 그 경로가 아직 같은 파일인지는 쓰는 쪽이 확인하세요. react-code-editor는 경로마다 번호를 두고, 이름을 바꾸거나 지울 때 번호를 올려 늦게 끝난 읽기 결과를 버립니다.

### 3. 입력칸에서 미리 검사합니다

`add`와 `rename`은 쓸 수 없는 이름이면 오류를 던집니다. 사용자가 입력하는 동안 `validateNewName`·`validateRename`으로 먼저 검사해 이유를 보여 주세요. 다만 이 두 함수는 **이름만** 봅니다. 부모 폴더가 없거나 파일이어도 오류를 던지지 않고 이름 검사 결과만 돌려줍니다. 그런 경우는 `add`가 던지는 오류로 처리합니다.

### 4. 변경 기록을 저장하고, 복원 실패를 안내합니다

`changes()` 전체를 저장소(IndexedDB 등)에 저장하고, 다시 열 때 `createVirtualFs(source, { changes })`로 넘기세요. `ReplayError`가 나면 복원을 멈추고 사용자에게 알립니다. 저장본은 저절로 지우지 마세요. 이 프로젝트에서는 "다시 시도"와 "버리기"를 고르게 하고, "버리기"를 골랐을 때만 저장본을 지웁니다. 저장본이 **같은 원본**에서 나왔는지 확인하는 것도 쓰는 쪽의 몫입니다.

### 5. 구독자 안에서 던진 오류를 잡습니다

`onDidChange` 구독자가 오류를 던져도 조작은 이미 성공한 것으로 끝나고, 다른 구독자도 알림을 받습니다. 이 패키지가 그 오류를 `queueMicrotask`로 나중에 다시 던지므로, 콘솔이나 전역 오류 처리기에서 볼 수 있습니다. 구독을 그만둘 때는 돌려받은 객체의 `dispose()`를 부르세요.

## 상황별 결과

흔히 만나는 상황마다 어떤 결과가 나오는지 모았습니다.

| 상황 | 결과 |
|---|---|
| 폴더 항목이 없는 ZIP | 파일 경로에서 폴더를 만들어 트리가 정상으로 나옵니다. |
| macOS Finder로 만든 ZIP | `__MACOSX/`, `.DS_Store`, `._*`는 트리에 없고, 다운로드한 ZIP에는 원본 그대로 남습니다. |
| 폴더 항목 없이 `foo/.DS_Store`만 있음 | `foo`가 트리에 빈 폴더로 보입니다. 파일 `foo`는 만들 수 없고(`duplicate`), 폴더 `foo`를 지우면 `foo/.DS_Store`도 빠집니다. |
| `__MACOSX/`가 든 ZIP에서 최상위에 `__MACOSX` 만들기 | `duplicate` |
| `.DS_Store`가 든 `src`를 `SRC`로 바꾸기 | 됩니다. `.DS_Store`도 `SRC` 아래로 옮겨집니다. |
| `__MACOSX_old/` 폴더 | 보통 폴더로 트리에 보이고, 그 안의 `.DS_Store`는 이 폴더를 따라갑니다. |
| `../evil.sh`가 든 ZIP | 트리에 없고, 다운로드한 ZIP에는 원본 그대로 남습니다. |
| `/a.txt`와 `a.txt`가 둘 다 있음 | 뒤 항목이 트리에 보이고, 다운로드한 ZIP에는 둘 다 남습니다. 트리의 `a.txt`를 지우면 둘 다 빠집니다. |
| 파일 `a`와 `a/b.txt`가 둘 다 있음 | `a`는 폴더로 보이고, 파일 `a`는 다운로드한 ZIP에 원본 그대로 남습니다. 폴더 `a`를 지우면 파일 `a`도 빠집니다. |
| 같은 원본 경로 `a.txt`가 두 번 있음 | 뒤 항목만 트리에 보이고, 다운로드한 ZIP에도 하나만 남습니다. |
| `README.md`가 있는 폴더에 `readme.md` 만들기 | `duplicate` |
| `readme.md`를 `README.md`로 바꾸기 | 됩니다. |
| `main.py`를 `app.py`로 바꾸고 고치지 않음 | 계획: `copy`, `path: 'app.py'`, `originalPath: 'main.py'` |
| `scripts` 폴더를 `bin`으로 바꾸고 안의 `run.sh`를 고침 | 계획: `write`, `path: 'bin/run.sh'`, `originalPath: 'scripts/run.sh'` |
| `a.txt`를 지우고 같은 이름으로 새로 만듦 | 새 파일입니다. 읽으면 빈 바이트, 계획은 `originalPath` 없는 `write` |
| 새로 만든 빈 폴더 | 계획: `directory` |
| 폴더 안의 파일을 모두 지움 | 그 폴더가 계획에 `directory`로 들어갑니다. |
| 최상위 폴더(`''`) 지우기 | `PathNotFoundError` |
| 다른 ZIP으로 만든 저장본으로 복원 | `ReplayError` |

## API 레퍼런스

공개 함수는 `createVirtualFs` 하나이고, 나머지 기능은 모두 그 결과 객체(`VirtualFs`)에 있습니다.

### `createVirtualFs(source, options?): Promise<VirtualFs>`

파일 출처의 목록을 한 번 읽어 트리를 만듭니다.

| 인자 | 설명 |
|---|---|
| `source` | 파일 출처(`FileSource`). 연 ZIP(`openZip` 결과)을 그대로 넘기면 됩니다. |
| `options.changes` | 복원할 때 다시 적용할 변경 기록(`TreeChange[]`). 생략하면 원본 그대로 만듭니다. |

변경을 다시 적용하지 못하면 `ReplayError`를 던집니다.

### `VirtualFs`

메서드를 떼어 콜백으로 넘겨도 동작합니다(`const { children } = fs`처럼 써도 됩니다).

**조회**

| 멤버 | 설명 |
|---|---|
| `children(path)` | 정렬한 자식 노드 목록. 최상위는 `''`입니다. 없거나 파일이면 빈 목록입니다. |
| `getNode(path)` | 노드 하나. 없으면 `undefined`입니다. |
| `originalPathOf(path)` | 원본 경로. 새로 만든 파일과 폴더는 `undefined`입니다. |
| `structureVersion()` | 구조 버전. 처음은 0, 복원하면 적용한 변경 수입니다. |
| `changes()` | 지금까지의 변경 기록(복사본). 복원했으면 다시 적용한 기록도 들어 있습니다. |

**조작**

| 멤버 | 돌려주는 값 |
|---|---|
| `add(parentPath, name, isDirectory)` | 만든 노드 |
| `delete(path)` | 지운 노드 전체 (부모 먼저) |
| `rename(path, newName)` | 옮긴 경로 `{ from, to, isDirectory }` 전체 (부모 먼저). 같은 이름이면 빈 목록 |

**검사**

| 멤버 | 돌려주는 값 |
|---|---|
| `validateNewName(parentPath, name)` | 쓸 수 있으면 `undefined`, 없으면 이유(`NameProblem`) |
| `validateRename(path, newName)` | `validateNewName`과 같습니다. 이름을 바꾸려는 항목 자신은 중복으로 보지 않습니다. |

**읽기와 내보내기**

| 멤버 | 설명 |
|---|---|
| `readHead(path, bytes)` | 파일의 앞부분. 원본 경로로 파일 출처를 읽습니다. 새 파일은 빈 바이트입니다. |
| `readAll(path)` | 파일 전체. 새 파일은 빈 바이트입니다. |
| `exportEntries(written)` | 내보내기 계획(`ExportEntry[]`). `written`에 트리에 없는 경로가 있으면 `PathNotFoundError`, 폴더가 있으면 `NotAFileError`입니다. |

**알림**

| 멤버 | 설명 |
|---|---|
| `onDidChange(listener)` | 구조가 바뀔 때마다 `{ change, structureVersion }`으로 부릅니다. 조작 함수가 값을 돌려주기 전에 동기로 부릅니다([알림 시점](#알림-시점)). 돌려받은 객체의 `dispose()`로 구독을 그만둡니다. |

### 타입

이 패키지가 내보내는 타입입니다.

| 타입 | 설명 |
|---|---|
| `FileSource` | 파일 출처. `list`, `readHead`, `readAll` |
| `FileSourceEntry` | 출처의 항목 하나. `{ path, isDirectory, size }` |
| `TreeNode` | 트리 노드. `{ path, name, isDirectory, size }`. 경로가 바뀌면 새 객체가 됩니다. |
| `TreeChange` | 변경 기록 하나. `add`, `delete`, `rename` 세 종류 |
| `TreeChangeEvent` | `onDidChange`가 받는 값. `{ change, structureVersion }` |
| `RenamedPath` | `rename`의 결과 하나. `{ from, to, isDirectory }` |
| `ExportEntry` | 내보내기 계획 항목. `copy`, `write`, `directory` 세 종류 |
| `NameProblem` | `'empty'`, `'reserved'`, `'invalid-character'`, `'duplicate'` |
| `CreateVirtualFsOptions` | `createVirtualFs`의 선택 값. `{ changes? }` |
| `Disposable` | `{ dispose() }`. 구독을 그만둘 때 씁니다. |

## 성능

Apple Silicon Mac(M1 Pro, M2 Pro)의 Node.js 23~24에서 테스트로 잰 값입니다.

| 작업 | 항목 수 | 시간 |
|---|---|---|
| 트리 만들기 + 최상위 정렬 (`createVirtualFs`, 첫 `children('')`) | 5만 개 | 약 130~450ms (1회, 기계 부하에 따라 더 걸림) |
| 내보내기 계획 (`exportEntries`) | 5만 개 | 약 10~100ms (1회, 기계 부하에 따라 더 걸림) |

값은 `build.test.ts`·`export-plan.test.ts`를 한 번 실행했을 때 `console.info`로 찍힌 값입니다. 브라우저가 아니라 Node.js에서 쟀고, 다른 테스트와 함께 돌리면 더 느리게 나옵니다. 목표 시간은 1초이지만, 테스트는 1초를 넘어도 실패로 치지 않고 경고(`console.warn`, GitHub Actions에서는 경고 주석)만 남깁니다. 잰 시간이 CI 기계의 속도에 따라 들쭉날쭉하기 때문입니다([ADR-0027](../../docs/adr/0027-performance-budgets.md)).

빠른 이유는 세 가지입니다.

- 트리를 만들 때 파일 내용을 읽지 않고, 목록만 한 번 훑습니다.
- 자식 목록은 폴더마다 정렬해 두고, 그 폴더가 바뀔 때만 다시 정렬합니다. 화면에 보이는 폴더만 정렬하므로 펼치지 않은 폴더는 비용이 없습니다.
- 경로로 노드를 바로 찾을 수 있게 경로별로 `Map`에 저장해 둡니다.

## 한계

쓰기 전에 알아 둘 한계는 다음과 같습니다.

- **다른 폴더로 옮기기는 없습니다.** 이름 변경은 같은 폴더 안에서만 됩니다. 저장된 변경에 옮기기가 들어 있으면 복원에 실패합니다.
- **위험한 경로(`..`) 항목은 다운로드한 ZIP에 원본 그대로 남습니다.** 트리에서 숨길 뿐 지우지는 않습니다. 사용자가 올린 ZIP의 내용을 몰래 바꾸지 않으려는 것입니다([ADR-0038](../../docs/adr/0038-zip-slip-entries-exported-unchanged.md)).
- **대소문자나 NFC만 다른 이름은 새로 만들 수 없습니다.** 원본 ZIP에 이미 그런 두 파일이 있으면 그대로 둡니다.
- **`._main.py` 같은 macOS 부가 파일은 짝이 되는 파일(`main.py`)이 아니라 들어 있는 폴더를 따라갑니다.** `main.py`의 이름을 바꿔도 `._main.py`의 이름은 그대로이고, 그 폴더를 지우거나 이름을 바꿀 때만 함께 바뀝니다.
- **이름 검사 함수는 이름만 봅니다.** `validateNewName`·`validateRename`은 부모 폴더가 없거나 파일이어도 오류 없이 이름 검사 결과만 돌려줍니다.
- **이름 검사는 경로 구분자와 제어 문자만 막습니다.** Windows에서 못 쓰는 문자(`: * ? " < > |`)와 `CON` 같은 이름, 끝이 `.`인 이름은 통과합니다.
- **무시 목록에 걸리는 이름(`.DS_Store`, `._*`, `__MACOSX`)도 새로 만들 수 있습니다.** 같은 자리에 숨긴 항목이 없을 때만입니다. 지금은 트리에 보이지만, 다운로드한 ZIP을 다시 올리면 숨긴 항목이 됩니다.
- **원본 경로는 NFC로 바꾸지 않습니다.** 새로 만들거나 이름을 바꿀 때 입력한 이름만 NFC로 바꿉니다. `zip-archive`로 연 ZIP이라면 `openZip`이 이름을 이미 NFC로 바꿔 넘깁니다.

## 테스트

```sh
pnpm --filter @codefold/virtual-fs test
```

테스트 파일마다 확인하는 내용은 다음과 같습니다.

| 파일 | 확인하는 것 |
|---|---|
| [build.test.ts](test/build.test.ts) | 트리 만들기: 폴더 항목 없는 목록, 정렬, 파일을 읽지 않는지, 경로 정리, 숨긴 항목, 겹친 경로, 파일·폴더 충돌, 같은 배열 돌려주기, 5만 개 항목 |
| [mutations.test.ts](test/mutations.test.ts) | 추가·삭제·이름 변경, 이름 검증, NFC, 구조 버전과 변경 기록, 실패한 조작, `onDidChange` |
| [export-plan.test.ts](test/export-plan.test.ts) | 내보내기 계획: `copy`·`write`·`directory` 규칙, 이름 바꾼 폴더 안의 고친 파일, 지운 뒤 새로 만든 파일, 숨긴 항목, 빈 폴더, 5만 개 항목 |
| [replay.test.ts](test/replay.test.ts) | 변경 기록 다시 적용, 맞지 않는 기록의 `ReplayError`, 옮기기가 든 기록 |
| [review-fixes.test.ts](test/review-fixes.test.ts) | 숨긴 항목이 폴더 삭제·이름 변경을 따르는지, 숨긴 항목과 같은 이름, 구독자 오류, 빈 자식 목록의 동일성, 무시 항목만 든 폴더, `__MACOSX`와 겹치는 이름, `__MACOSX_old` 같은 보통 폴더, 끝의 `/`를 뗀 폴더 항목 |
| [names.test.ts](test/names.test.ts) | 이름 검사 규칙, 중복 비교 키, 정렬(폴더 먼저, 자연 정렬, 가나다순) |
| [paths.test.ts](test/paths.test.ts) | 경로 정리와 숨길 항목 판단, 경로 도우미, 오류 class |
| [public-api.test.ts](test/public-api.test.ts) | 공개 API 목록, 메서드를 떼어 써도 동작하는지 |

## 관련 결정 기록

왜 이렇게 설계했는지는 아래 문서에 있습니다.

- [ADR-0012](../../docs/adr/0012-file-tree-operations.md): 트리에서 추가·삭제·이름 변경을 지원하고, 옮기기는 넣지 않는 결정
- [ADR-0014](../../docs/adr/0014-session-persistence-indexeddb.md): 작업 상태를 IndexedDB에 저장하고 다시 열면 복원하는 결정
- [ADR-0016](../../docs/adr/0016-workspace-layer-and-ports.md): 가운데에 가상 파일 시스템을 두고 파일 출처를 `FileSource`로 받는 구조
- [ADR-0017](../../docs/adr/0017-factory-interfaces-and-plain-data.md): 팩토리 함수와 순수 데이터, `Error` 하위 class 규칙
- [ADR-0029](../../docs/adr/0029-virtualized-file-tree.md): 파일 트리를 화면에 보이는 줄만 그리는 결정
- [ADR-0032](../../docs/adr/0032-export-write-keeps-original-path.md): 고친 파일에 원래 경로를 적어 속성을 이어받는 결정
- [ADR-0033](../../docs/adr/0033-export-keeps-empty-directories.md): 다운로드 ZIP에 빈 폴더를 남기는 결정
- [ADR-0036](../../docs/adr/0036-hidden-entries-follow-tree-folders.md): 트리 폴더 안의 숨긴 항목이 그 폴더의 삭제·이름 변경을 따르는 결정
- [ADR-0038](../../docs/adr/0038-zip-slip-entries-exported-unchanged.md): `..`이 든 항목을 경고 없이 다운로드한 ZIP에 원본 그대로 넣는 결정
