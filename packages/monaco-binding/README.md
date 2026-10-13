# @codefold/monaco-binding

코드 에디터 Monaco를 **여러 파일, 여러 탭, 여러 분할 화면에서 쓸 수 있게 이어 주는** 패키지입니다. 파일마다 내용을 하나씩 관리하고, 어떤 파일을 고쳤는지와 마지막 다운로드 뒤에 더 고친 것이 있는지를 추적합니다. React를 쓰지 않는 순수 TypeScript라서 어떤 화면 프레임워크와도 함께 쓸 수 있습니다.

## 목차

- [왜 필요한가](#왜-필요한가)
- [먼저 알아 둘 개념](#먼저-알아-둘-개념)
- [한눈에 보는 사용 흐름](#한눈에-보는-사용-흐름)
- [model 등록부](#model-등록부)
- [에디터 그룹](#에디터-그룹)
- [받지 않은 변경 추적기](#받지-않은-변경-추적기)
- [worker 설정과 단축키](#worker-설정과-단축키)
- [오류](#오류)
- [쓰는 쪽이 꼭 처리해야 할 것](#쓰는-쪽이-꼭-처리해야-할-것)
- [상황별 결과](#상황별-결과)
- [API 레퍼런스](#api-레퍼런스)
- [성능](#성능)
- [한계](#한계)
- [테스트](#테스트)
- [관련 결정 기록](#관련-결정-기록)

## 왜 필요한가

Monaco는 VS Code의 편집 화면을 떼어 낸 코드 에디터입니다. 에디터 하나에 파일 하나를 띄우는 데는 따로 준비할 것이 거의 없습니다. 하지만 이 프로젝트처럼 **파일 여러 개를 탭으로 오가고, 화면을 나눠 두 파일을 나란히 보는** 에디터를 만들려면 챙길 것이 많습니다.

- 탭을 바꿀 때마다 에디터를 새로 만들면 느리고, 커서 위치와 undo 기록이 사라집니다.
- 같은 파일을 두 분할 화면에 띄우면, 한쪽에서 친 글자가 다른 쪽에도 바로 보여야 합니다.
- 탭을 닫았다고 고친 내용을 버리면 안 됩니다. 반대로 안 고친 파일은 메모리에서 치워야 합니다.
- 파일 이름을 바꾸거나 지우면, 그 파일을 보던 화면이 모두 따라 바뀌어야 합니다.
- 트리에 수정 표시를 달고 페이지를 떠날 때 경고하려면, 파일이 "원본과 달라졌는지"와 "다운로드 뒤에 더 고쳤는지"를 알아야 합니다. 이 판단은 키를 누를 때마다 일어나므로 가벼워야 합니다.

이 패키지는 이런 일을 세 부품에 나눠 맡깁니다.

| 부품 | 맡는 일 |
|---|---|
| **model 등록부** (`createModelRegistry`) | 파일마다 내용(model)을 하나씩 만들고 지웁니다. 원본과 달라졌는지 판단합니다. |
| **에디터 그룹** (`createEditorGroup`) | 분할 화면 하나의 에디터입니다. 탭을 바꾸면 에디터는 그대로 두고 보여 줄 model만 바꿉니다. |
| **받지 않은 변경 추적기** (`createUnexportedTracker`) | 마지막 다운로드 뒤에 더 고친 것이 있는지, 몇 개인지 셉니다. |

## 먼저 알아 둘 개념

이 문서에 자주 나오는 용어를 먼저 풀어 둡니다. Monaco를 처음 접한다면 이 절부터 읽으세요.

### model과 에디터

Monaco는 **내용**과 **화면**을 나눠 다룹니다.

- **model**은 파일 하나의 내용입니다. 글자, undo·redo 기록, 파일을 가리키는 주소(URI)가 들어 있습니다. 화면에 보이지 않아도 model은 남아 있을 수 있습니다.
- **에디터**는 model을 화면에 그리는 틀입니다. 에디터 하나는 한 번에 model 하나를 보여 주고, `setModel`로 보여 줄 model을 바꿉니다.

그래서 같은 model을 에디터 두 개에 띄우면 두 화면이 같은 내용을 공유합니다. 한쪽에서 입력하면 다른 쪽에도 바로 보입니다. 탭을 바꿀 때는 에디터를 새로 만들지 않고 model만 바꾸면 됩니다.

이 패키지는 파일마다 model을 **하나만** 만들고, URI는 `file:///트리경로`로 정합니다. `src/main.py`의 model URI는 `file:///src/main.py`입니다. Monaco는 이 URI의 확장자를 보고 구문 강조에 쓸 언어를 고릅니다.

### 뷰 상태

**뷰 상태**는 에디터에서 파일을 어디까지, 어떻게 보고 있었는지를 담은 정보입니다. 커서 위치, 선택 영역, 스크롤 위치, 접어 둔 코드 영역이 들어 있습니다. 에디터 그룹은 탭을 바꿀 때 파일마다 뷰 상태를 저장해 두었다가, 그 탭으로 돌아오면 되살립니다.

### 버전 번호

Monaco model에는 **버전 번호**(`getAlternativeVersionId()`)가 있습니다. 내용이 바뀔 때마다 달라지고, **undo로 이전 상태가 되면 번호도 그때 값으로 돌아갑니다.**

```
처음 열었을 때     1
"a" 입력          2
"b" 입력          3
undo              2   ← "a"만 입력한 상태로 돌아감
undo              1   ← 처음 상태와 같음
```

그래서 "원본과 달라졌는지"는 전체 내용을 비교하지 않고 **숫자 하나만 비교**해서 알 수 있습니다. 처음 열 때의 번호를 저장해 두었다가, 지금 번호와 다르면 고친 것으로 봅니다.

### 수정 여부(dirty)

**수정 여부**는 파일이 원본과 달라졌는지를 나타냅니다. 트리와 탭의 수정 표시(●)에 씁니다. 다운로드를 해도 사라지지 않습니다. 비교 기준이 늘 **원본**이기 때문입니다.

### 받지 않은 변경

**받지 않은 변경**은 마지막으로 다운로드한 뒤에 더 고친 내용, 곧 아직 ZIP으로 받지 않은 변경입니다. 페이지를 떠날 때 "받지 않은 변경이 있습니다" 경고와, 다운로드 버튼 옆의 개수 표시에 씁니다. 다운로드하면 0이 됩니다.

두 개념은 다릅니다. 파일을 고치고 다운로드한 직후를 생각해 보세요. 그 파일은 원본과 달라 **수정됨** 상태이지만, 다운로드한 뒤 더 고친 것이 없으므로 **받지 않은 변경은 없습니다.**

### 탭 수

같은 파일을 여러 분할 화면에서 탭으로 열 수 있습니다. 등록부는 파일마다 **지금 열린 탭이 몇 개인지** 셉니다. 그래야 마지막 탭이 닫혔을 때 model을 치울지 정할 수 있습니다. 탭이 언제 열리고 닫히는지는 탭 UI를 그리는 쓰는 쪽(이 패키지를 가져다 쓰는 앱)만 압니다. 그래서 쓰는 쪽이 `acquire`(열림)와 `release`(닫힘)로 알려 줘야 합니다.

### Monaco 주입

이 패키지는 `monaco-editor`를 직접 불러오지 않습니다. 쓰는 쪽이 불러온 Monaco 객체를 함수에 넘깁니다. 이렇게 하면 앱이 Monaco를 통째로 불러오든, 일부 언어만 불러오든, 필요할 때 늦게 불러오든 이 패키지는 그대로 동작합니다. 이 패키지의 빌드 결과에도 Monaco 코드가 들어가지 않습니다. 쓰는 쪽은 `monaco-editor`(0.56 이상)를 직접 설치해야 합니다. 이 패키지가 타입을 0.56부터 생긴 `monaco-editor/editor/editor.api.js` 경로에서 가져오기 때문입니다.

## 한눈에 보는 사용 흐름

```
① 준비          Monaco worker 설정, 등록부·추적기 만들기
② 화면 만들기    분할 화면마다 createEditorGroup
③ 파일 열기      registry.open → registry.acquire → group.show
④ 탭 닫기        registry.release → group.forget
⑤ 이름 변경·삭제 registry.rename / remove → tracker.recordTreeChange
⑥ 다운로드       tracker.snapshot → (ZIP 만들기) → tracker.markExported
```

코드로 쓰면 다음과 같습니다.

```ts
import * as monaco from 'monaco-editor';
import {
  createEditorGroup,
  createModelRegistry,
  createUnexportedTracker,
  createWorkerEnvironment,
} from '@codefold/monaco-binding';

// ① 준비: worker 설정은 쓰는 쪽이 전역에 넣는다(아래 "worker 설정" 참고).
self.MonacoEnvironment = createWorkerEnvironment(makeWorker);
const registry = createModelRegistry(monaco);
const tracker = createUnexportedTracker(registry);

registry.onDirtyChange((path, dirty) => markTreeItem(path, dirty)); // 수정 표시
tracker.onChange(({ has, count }) => showUnexported(has, count));   // 이탈 경고·개수

// ② 분할 화면마다 에디터 그룹을 하나씩 만든다.
const left = createEditorGroup(monaco, registry, leftElement);

// ③ 파일 열기: model을 만들고(이미 있으면 그대로), 탭 수를 올리고, 화면에 띄운다.
registry.open('src/main.py', text); // text는 파일 내용(문자열). 처음 열 때만 쓰인다
registry.acquire('src/main.py');
left.show('src/main.py');

// ④ 탭 닫기: 탭 수를 내리고, 이 그룹에 저장해 둔 뷰 상태를 버린다.
registry.release('src/main.py'); // 마지막 탭이고 안 고친 파일이면 model이 지워진다
left.forget('src/main.py');

// ⑤ 이름 변경: 파일마다 등록부에 먼저 알리고, 트리 변경을 추적기에 한 번 알린다.
//    fs는 @codefold/virtual-fs의 가상 파일 시스템이다. 구조 버전도 fs에서 얻는다.
fs.rename('src/main.py', 'app.py'); // virtual-fs는 같은 폴더 안의 새 이름만 받는다
registry.rename('src/main.py', 'src/app.py'); // 보던 그룹은 저절로 새 model로 바뀐다
tracker.recordTreeChange({ type: 'rename', from: 'src/main.py', to: 'src/app.py' }, fs.structureVersion());

// ⑥ 다운로드: ZIP에 넣을 목록(내보내기 계획)을 만들 때 기록을 얻어 두고, 다운로드가 성공하면 그 기록을 확정한다.
const snapshot = tracker.snapshot();
await downloadZip();
tracker.markExported(snapshot);
```

`makeWorker`, `markTreeItem`, `showUnexported`, `leftElement`, `downloadZip`은 예시일 뿐입니다. 실제 구현은 쓰는 쪽이 준비합니다.

## model 등록부

`createModelRegistry(monaco)`는 파일마다 model 하나를 관리하는 등록부를 만듭니다. 경로는 앞에 `/`가 없는 트리 경로(예: `src/main.py`)를 씁니다.

### 열기

`open(path, text)`는 그 경로의 model을 돌려줍니다. 없으면 `text`로 새로 만들고, 그때의 버전 번호를 **원본 버전**으로 저장해 둡니다. 이미 있으면 `text`는 쓰지 않고 있던 model을 돌려줍니다. 그래서 고친 파일을 다시 열어도 고친 내용이 그대로 나옵니다.

### 수정 여부 판단

model 내용이 바뀔 때마다 지금 버전 번호가 원본 버전과 같은지 비교합니다. 결과가 **바뀔 때만** `onDirtyChange(path, dirty)`로 알립니다.

- 첫 글자를 입력하면 `dirty: true`로 한 번 알립니다.
- 계속 입력해도 여전히 수정됨 상태이므로 알리지 않습니다. 1,000번 입력해도 알림은 한 번입니다.
- undo로 원본 상태까지 돌아가면 `dirty: false`로 한 번 알립니다.

버전 번호만 비교하므로, 글자를 쳤다가 **직접 지워서** 내용이 원본과 같아져도 고친 것으로 봅니다(VS Code와 같습니다). 입력할 때마다 전체 내용을 비교하지 않으려고 이렇게 정했습니다. 실제로 내용이 원본과 같은지는 이 패키지가 아니라 다운로드를 만드는 쪽(react-code-editor)이 다운로드할 때 한 번 비교합니다.

### 탭 수와 model 수명

등록부는 탭 수와 수정 여부를 함께 보고 model을 남길지 지울지 정합니다. 탭을 닫았다고 고친 내용을 버리지 않기 위해서입니다.

| 상황 | model |
|---|---|
| 안 고친 파일의 마지막 탭을 닫음 (`release`) | 지워서 메모리를 비웁니다. |
| 다른 분할 화면에 같은 파일의 탭이 남아 있음 | 남깁니다. |
| 고친 파일의 마지막 탭을 닫음 | **남깁니다.** 다시 열면 고친 내용과 undo 기록이 그대로 이어집니다. |
| 파일을 지움 (`remove`) | 고쳤어도 지우고, 수정 표시도 없앱니다. |

탭 수에 대해 알아 둘 규칙은 다음과 같습니다.

- `open`은 탭 수를 올리지 않습니다. 내용을 읽으려고 `open`만 부르면 그 model은 치워지지 않고 남습니다. 탭에 띄우지 않을 파일의 내용은 virtual-fs에서 읽으세요.
- `release`를 탭 수보다 더 불러도 0 아래로 내려가지 않습니다. 하지만 `acquire` 없이 `release`하면, 다른 분할 화면이 보여 주던 안 고친 model도 곧바로 지워집니다.
- 고친 파일은 탭이 없어도 model이 남습니다. 그래서 `dirtyPaths()`에 나온 경로는 늘 `get()`으로 model을 얻을 수 있습니다. 반대로 고친 파일이 많으면 탭을 닫아도 메모리가 줄지 않습니다.

### 이름 변경·되돌리기

Monaco의 model은 만든 뒤에 URI를 바꿀 수 없습니다. 그래서 이름을 바꾸거나 원본으로 되돌릴 때는 model을 **새로 만들고** 기존 model을 지웁니다.

| 동작 | 하는 일 |
|---|---|
| `rename(from, to)` | 같은 내용으로 새 URI의 model을 만들고, 탭 수와 수정 여부를 옮긴 뒤 기존 model을 지웁니다. |
| `revert(path, originalText)` | 기존 model을 지웁니다. 탭이 열려 있으면 `originalText`로 새 model을 만들고, 아니면 지우기만 합니다. 수정 표시를 없앱니다. |
| `markDirty(path)` | 내용은 그대로 두고 수정됨 상태로 만듭니다. 원본 버전을 `NaN`으로 바꿔 어떤 버전 번호와도 같지 않게 하므로, 이 파일은 `revert`로만 수정 표시가 사라집니다. 인코딩을 바꾸는 것처럼 내용은 같지만 다운로드할 때 새로 써야 하는 파일에 씁니다. model이 없으면 `ModelNotFoundError`입니다. |

model을 새로 만들면 **undo 기록은 이어지지 않습니다.** Monaco의 undo 기록은 model 안에 있기 때문입니다. 그래서 고친 파일의 이름을 바꾸면 새 이름에서는 undo로 원본까지 돌아갈 수 없습니다. 이 패키지는 그런 파일을 늘 수정됨 상태로 봅니다. 이런 파일의 수정 표시를 없애는 방법은 `revert` 하나뿐입니다. 내용을 원본과 똑같이 고쳐 써도 수정 표시는 남습니다.

model을 새로 만들거나 지울 때마다 `onDidReplaceModel({ from, to })`로 알립니다. 에디터 그룹이 이 알림을 받아 화면을 **알아서** 바꾸므로, 쓰는 쪽이 그룹마다 따로 처리할 필요가 없습니다.

| 알림 | 뜻 |
|---|---|
| `{ from: 'a.py', to: 'b.py' }` | 이름을 바꿨습니다. |
| `{ from: 'a.py', to: 'a.py' }` | 원본으로 되돌렸습니다. 같은 경로에 새 model이 생겼습니다. |
| `{ from: 'a.py', to: undefined }` | model을 지웠습니다(삭제, 마지막 탭 닫힘, 탭 없이 되돌림). |

### 알림 규칙

등록부와 추적기의 알림(`onDirtyChange`, `onDidReplaceModel`, `onChange`)은 모두 다음 규칙을 따릅니다.

- **그 일이 일어난 자리에서 바로 불립니다.** 키 입력 한 번을 처리하는 도중에 불릴 수 있으니, 알림 안에서 무거운 일을 하지 마세요.
- **구독할 때 지금 상태를 알려 주지 않습니다.** 화면을 처음 그릴 때는 `registry.dirtyPaths()`와 `tracker.state()`로 직접 읽으세요.
- **순서가 정해져 있습니다.** 고친 파일의 이름을 바꾸면 `onDidReplaceModel({ from, to })`가 먼저 오고, 이어서 `onDirtyChange(from, false)`, `onDirtyChange(to, true)`가 옵니다. 고친 파일을 지우면 교체 알림 뒤에 `onDirtyChange(path, false)`가 옵니다.
- **구독자 하나가 오류를 던져도 나머지 구독자는 알림을 받고, 등록부 상태도 깨지지 않습니다.** 오류를 삼키지는 않습니다. 잠시 뒤(`queueMicrotask`) 다시 던지므로 브라우저 콘솔과 오류 수집기에서 볼 수 있습니다.

## 에디터 그룹

`createEditorGroup(monaco, registry, container, options?)`는 분할 화면 하나에 Monaco 에디터 하나를 만듭니다. `container`는 에디터를 그릴 HTML 요소입니다.

| 멤버 | 하는 일 |
|---|---|
| `show(path)` | 그 파일을 에디터에 띄웁니다. 지금 보던 파일의 뷰 상태를 저장하고, 새 파일의 뷰 상태가 있으면 되살립니다. 먼저 `open`으로 등록부에 model을 만들어 둬야 합니다. |
| `clear()` | 에디터를 비웁니다. 보던 파일의 뷰 상태는 남깁니다. |
| `forget(path)` | 이 그룹에서 그 파일의 탭이 닫혔을 때 부릅니다. 저장해 둔 뷰 상태를 버립니다. |
| `current()` | 지금 보이는 파일의 경로입니다. |
| `editor` | Monaco 에디터 자체입니다. 포커스를 주거나 옵션을 바꿀 때 씁니다. model은 `show`·`clear`로만 바꾸세요. |
| `dispose()` | 에디터를 지웁니다. model은 등록부가 관리하므로 지우지 않습니다. 여러 번 불러도 됩니다. |

등록부가 model을 바꾸면 그룹은 다음과 같이 따라갑니다.

- **보던 파일의 이름이 바뀜**: 새 model로 바꾸고, 커서와 스크롤 위치를 그대로 옮깁니다.
- **보던 파일을 원본으로 되돌림**: 원본 내용의 새 model로 바꾸고, 커서와 스크롤 위치를 되도록 그대로 둡니다.
- **보던 파일이 지워짐**: 빈 에디터가 됩니다.
- **보지 않던 파일의 이름이 바뀜**: 저장해 둔 뷰 상태만 새 경로로 옮깁니다.

그룹은 **에디터 화면만** 바꿉니다. 탭 이름과 탭 목록은 쓰는 쪽이 바꿔야 합니다. 이름을 바꾸면 `current()`가 새 경로를 돌려주고, 파일을 지우면 `undefined`를 돌려줍니다. 지운 파일의 탭은 `release`나 `forget`을 부르지 않아도 됩니다. 이미 정리되었고, 불러도 아무 일도 일어나지 않습니다. 빈 에디터가 된 그룹에는 남은 탭 가운데 하나를 `show`하세요.

`dispose()`를 여러 번 불러도 되게 만든 것은 React의 StrictMode 때문입니다. 개발 중에는 React가 화면을 만들었다 바로 지우고 다시 만드는데, 이때 정리 함수가 두 번 불릴 수 있습니다.

`options.editorOptions`로 Monaco 에디터 옵션을 넘길 수 있습니다. `automaticLayout`은 기본으로 켜져 있습니다. 에디터를 담은 요소(`container`)의 크기가 바뀌면 에디터 크기를 저절로 맞춰 주는 옵션이고, `editorOptions`에서 `automaticLayout: false`로 끌 수 있습니다. `model` 옵션은 무시합니다.

## 받지 않은 변경 추적기

`createUnexportedTracker(registry)`는 마지막 다운로드 뒤에 더 고친 것이 있는지 확인하고, 있으면 몇 개인지 셉니다.

추적기는 만들 때 등록부에 이미 있는 수정 상태를 읽지 않습니다. 그래서 추적기는 등록부를 만든 직후, model을 열기 전에 만드세요. 이미 고친 model이 있는 등록부에 나중에 붙이면, 다음 알림이 올 때까지 `state()`와 `paths()`는 받지 않은 변경이 없는 상태를 돌려줍니다.

### 판단 규칙

아직 한 번도 다운로드하지 않았을 때는 원본과 달라진 파일이나 트리 구조 변경이 하나만 있어도 받지 않은 변경으로 봅니다.

다운로드한 뒤에는 아래 가운데 하나라도 해당하면 받지 않은 변경으로 봅니다.

1. 다운로드할 때 수정됨 상태였던 파일의 버전 번호가 그때와 다릅니다. 더 입력했다는 뜻입니다.
2. 그 파일을 원본으로 되돌렸습니다. 다운로드한 ZIP에는 고친 내용이 들어 있으니, 지금과 다릅니다.
3. 다운로드할 때 안 고쳤던 파일을 그 뒤에 고쳤습니다.
4. 다운로드한 뒤에 파일이나 폴더를 추가하거나 삭제하거나 이름을 바꿨습니다.

버전 번호로 비교하므로, 다운로드한 뒤 입력했다가 **undo로 다운로드했던 상태까지 돌아가면** 받지 않은 변경이 저절로 사라집니다. 하지만 undo를 더 해서 **원본까지** 돌아가면 다시 생깁니다. 다운로드한 ZIP에는 고친 내용이 들어 있어서, 원본이 된 지금과 다르기 때문입니다(규칙 2).

파일 하나로 처음부터 따라가 보면 다음과 같습니다.

| 동작 | 버전 번호 | 수정 여부 | 받지 않은 변경 (`has` / `count`) |
|---|---|---|---|
| 파일 열기 (`open`) | 1 | 수정 안 됨 | 거짓 / 0 |
| "b" 입력 | 2 | 수정됨 | 참 / 1 |
| 다운로드 시작 (`snapshot`) | 2 | 수정됨 | 참 / 1 |
| ZIP을 만드는 동안 "c" 입력 | 3 | 수정됨 | 참 / 1 |
| 다운로드 성공 (`markExported`) | 3 | 수정됨 | 참 / 1 ("c"는 다운로드한 ZIP에 없음) |
| undo | 2 | 수정됨 | 거짓 / 0 (다운로드한 ZIP과 같아짐) |
| undo | 1 | **수정 안 됨** | **참 / 1** (원본이 됐지만 다운로드한 ZIP에는 "b"가 있음) |
| redo | 2 | 수정됨 | 거짓 / 0 |

### 개수 세기

`state()`는 `{ has, count }`를 돌려줍니다. `has`는 받지 않은 변경이 있는지(참·거짓)이고, `count`는 받지 않은 변경이 있는 **경로의 수**입니다. 사용자가 생각하는 "바뀐 것의 수"와 맞도록 다음처럼 셉니다.

| 상황 | 개수 |
|---|---|
| 고친 파일을 다운로드한 뒤 이름만 바꿈 | 1개 (옛 경로와 새 경로를 따로 세지 않습니다) |
| 다운로드한 뒤 새로 만든 파일의 이름을 바꿈 | 1개 |
| 고친 파일 셋이 든 폴더를 다운로드한 뒤 폴더 이름을 바꿈 | 1개 (폴더 하나로 셉니다) |
| 고친 파일 셋이 든 폴더를 다운로드한 뒤 폴더를 지움 | 1개 |
| 다운로드한 뒤 폴더 안에 파일을 추가하고 폴더 이름을 바꿈 | 2개 (새 폴더 경로, 그 안의 새 파일) |
| 다운로드한 뒤 파일을 추가했다가 다시 지움 | 1개 (트리 변경은 되돌려도 없어지지 않습니다) |
| 다운로드한 뒤 이름을 A→B로 바꿨다가 다시 A로 바꿈 | 1개 |

내용 변경은 undo로 되돌리면 저절로 사라지지만, **트리 변경은 되돌려도 사라지지 않습니다.** 추적기는 트리가 원래 모양으로 돌아왔는지 비교하지 않고, 다운로드 뒤에 트리 변경이 있었다는 사실만 셉니다.

`has`는 `count`가 1 이상이면 참입니다. 드물게 `count`가 0인데 `has`가 참일 수 있습니다. 구조 버전이 기록과 다른데 셀 경로가 없을 때입니다. 그래서 페이지 이탈 경고는 `has`로, 개수 표시는 `count`로 정하세요.

`has`나 `count`가 **바뀔 때만** `onChange`로 알립니다. 이미 받지 않은 변경이 있는 파일에서 계속 입력해도 알림은 가지 않습니다.

### 다운로드할 때

다운로드는 시간이 걸립니다. ZIP을 만드는 사이에 사용자가 더 입력할 수도 있습니다. 그래서 기록은 두 단계로 남깁니다.

```ts
const snapshot = tracker.snapshot(); // ① 내보내기 계획을 만드는 순간의 버전 기록
const blob = await buildZip();       //    ZIP을 만드는 동안에도 사용자는 입력할 수 있다
saveFile(blob);
tracker.markExported(snapshot);      // ② 다운로드가 성공한 뒤에 기록을 확정한다
```

①과 ② 사이에 입력한 내용은 다운로드한 ZIP에 들어가지 않았으므로, 받지 않은 변경으로 남습니다. 그 사이에 바꾼 이름이나 지운 파일도 기록에 반영되고, 마찬가지로 받지 않은 변경으로 남습니다. 다운로드가 실패하면 `markExported`를 부르지 않으면 됩니다.

`snapshot()`은 고친 파일마다 **undo 묶음을 끊어** 둡니다. Monaco는 이어서 친 글자를 한 묶음으로 묶어 undo 한 번에 되돌립니다. 다운로드하는 순간 이 묶음을 끊어 두어야 나중에 undo로 "다운로드했던 상태"에 정확히 돌아올 수 있습니다.

`snapshot`을 쓸 때 주의할 점은 세 가지입니다.

- **다운로드할 때만 부르세요.** undo 묶음을 끊기 때문에 다른 곳에서 부르면 사용자가 느끼는 undo 단위가 달라집니다.
- **새로고침한 뒤에 쓰려고 저장하지 마세요.** 스냅숏의 버전 번호는 지금 떠 있는 model에서만 뜻이 있습니다. 복원에는 지문을 저장합니다(아래 절).
- **다운로드가 겹치면 가장 나중에 만든 스냅숏만 넘기세요.** 오래된 스냅숏을 나중에 `markExported`에 넘기면 기록이 뒤로 돌아가, 그 뒤에 다운로드한 내용까지 받지 않은 변경으로 셉니다.

### 페이지를 새로고침한 뒤 복원할 때

페이지를 새로고침하면 model이 새로 만들어져 버전 번호도 처음부터 다시 매겨집니다. 그래서 저장해 둔 버전 번호로는 비교할 수 없습니다. 이때는 쓰는 쪽이 파일 내용의 지문(SHA-256 해시)으로 "다운로드했던 내용과 같은지"를 비교한 뒤, 그 결과를 넘깁니다.

```ts
tracker.adoptRestoredExport({
  versions: { 'src/app.py': registry.get('src/app.py')!.getAlternativeVersionId() }, // 지문이 같은 파일의 지금 버전
  changedPaths: ['src/new.py'], // 다운로드했을 때의 경로 목록과 비교해 지금 트리에서 달라진 경로
});
```

이 패키지는 지문을 계산하지 않습니다. 파일 내용을 읽고 해시를 만드는 일은 쓰는 쪽이 합니다.

복원은 다음 순서로 합니다.

1. 고친 파일은 `registry.open(path, 원본 내용)`으로 연 뒤, 저장해 둔 작업본을 편집(`model.pushEditOperations` 등)으로 넣습니다. `open`에 작업본을 바로 넘기면 그 내용이 원본 버전이 되어 "안 고친 파일"로 보입니다.
2. 고친 파일마다 지금 내용의 지문을 계산해, 저장해 둔 다운로드 기록의 지문과 비교합니다.
3. `adoptRestoredExport`를 부릅니다. `versions`에는 **지금 수정됨 상태이면서 지문이 같은 파일만** 넣습니다. 안 고친 파일을 넣으면 "되돌린 파일"(규칙 2)로 보고 받지 않은 변경으로 셉니다.

`changedPaths`의 경로는 다음 다운로드(`markExported`)까지 받지 않은 변경으로 남습니다. 그 경로의 이름을 바꾸거나 지우면 트리 변경과 같은 규칙으로 따라가서, 이름 변경·삭제 하나는 1개로 셉니다. 이 호출은 그전에 알린 트리 변경 기록도 비웁니다.

## worker 설정과 단축키

### worker 설정

Monaco는 자동 완성과 오류 표시 같은 무거운 일을 **Web Worker**(화면과 따로 실행되는 백그라운드 스레드)에서 합니다. Worker 파일을 어떻게 만들지는 번들러(Vite, webpack 등)마다 달라서, 쓰는 쪽이 "언어 이름을 받아 Worker를 만드는 함수"를 넘깁니다.

`createWorkerEnvironment(createWorker)`는 Monaco가 요구하는 설정 객체를 만들어 돌려줍니다. **전역에 넣지는 않으므로**, 쓰는 쪽이 `self.MonacoEnvironment`에 직접 넣어야 합니다. Vite에서는 다음과 같이 씁니다.

```ts
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = createWorkerEnvironment((label) => {
  if (label === 'json') return new JsonWorker();
  if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
  if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
  if (label === 'typescript' || label === 'javascript') return new TsWorker();
  return new EditorWorker(); // 기본 worker (label: 'editorWorkerService')
});
```

위 경로는 `monaco-editor` 0.56 이상에서 써야 하는 형식입니다. `monaco-editor`의 `package.json`이 `monaco-editor/…`를 `esm/vs/…`로 이어 주므로, 예전처럼 `monaco-editor/esm/vs/…`라고 쓰면 파일을 찾지 못합니다. 이 저장소의 앱도 같은 경로를 씁니다([createMonacoWorker.ts](../../apps/zip-editor/src/services/monaco/createMonacoWorker.ts)).

### undo·redo 단축키

에디터 그룹은 에디터마다 다음 단축키를 등록합니다.

| 동작 | Windows·Linux | macOS |
|---|---|---|
| undo | Ctrl+Z | Cmd+Z |
| redo | Ctrl+Shift+Z | Cmd+Shift+Z |

Monaco의 기본 redo는 Windows에서 Ctrl+Y라서, 운영체제와 상관없이 같은 키를 쓰도록 직접 등록합니다. 단축키는 **포커스가 있는 에디터에만** 걸리고, 그 에디터가 보여 주는 파일만 되돌립니다. 분할 화면이 여럿이어도 다른 화면의 파일이 되돌려지지 않습니다. 에디터가 읽기 전용(`readOnly` 옵션)이면 단축키를 눌러도 아무 일도 하지 않습니다. 다른 브라우저 탭에 편집 권한을 넘겨 읽기 전용이 된 탭에서 undo로 내용이 바뀌지 않게 하려는 것입니다(ADR-0024).

단축키는 Monaco의 동작(action)으로 등록하므로 명령 팔레트(F1)에도 "실행 취소", "다시 실행"으로 보입니다. 같은 키 값을 다른 곳(메뉴 표시 등)에 쓰고 싶으면 `undoKeybinding(monaco)`, `redoKeybinding(monaco)`로 받을 수 있습니다.

## 오류

이 패키지가 던지는 오류는 모두 `MonacoBindingError`를 상속합니다.

| 오류 | 언제 나오나 | 담긴 값 |
|---|---|---|
| `ModelNotFoundError` | 등록부에 model이 없는 경로를 `acquire`·`markDirty`하거나 `show`했습니다. 먼저 `open`해야 합니다. | `path` |
| `MonacoBindingError` | 이미 model이 있는 경로로 `rename`했습니다. 아무것도 바꾸지 않고 던집니다. | |

virtual-fs는 같은 이름을 미리 막으므로, 이름 변경 오류가 난다면 대개 지운 파일에 `registry.remove`를 부르지 않았다는 뜻입니다. 이 오류는 따로 하위 class가 없어서 `instanceof MonacoBindingError`로 거릅니다.

경로 앞에 `/`를 붙이지 마세요. URI가 `file:////…`로 어긋나 Monaco가 다른 파일로 봅니다.

model이 없는 경로에 `release`·`remove`·`rename`·`revert`를 부르면 오류 없이 **아무 일도 하지 않습니다.** 열어 본 적 없는 파일을 지우거나 이름을 바꾸는 것은 흔한 일이기 때문입니다.

## 쓰는 쪽이 꼭 처리해야 할 것

이 패키지는 model과 에디터만 다룹니다. 아래 여섯 가지는 쓰는 쪽이 맡아야 합니다.

### 1. Monaco를 설치하고, 불러와 넘깁니다

`monaco-editor`(0.56 이상)를 직접 설치하고, 불러온 객체를 `createModelRegistry`·`createEditorGroup`에 넘기세요. worker 설정(`self.MonacoEnvironment`)도 쓰는 쪽이 넣습니다. 언어 등록과 TypeScript 컴파일러 옵션 설정도 이 패키지 밖의 일입니다.

### 2. 탭이 열리고 닫힐 때 알립니다

탭이 열리면 `registry.acquire(path)`, 닫히면 `registry.release(path)`와 그 그룹의 `group.forget(path)`를 부르세요. `release`를 빠뜨리면 model이 지워지지 않고 남습니다. `acquire`를 빠뜨리면 다른 탭이 닫힐 때 아직 열린 탭의 model이 지워질 수 있습니다.

### 3. 이름 변경·삭제는 순서를 지켜 알립니다

트리에서 이름을 바꾸거나 지우면 다음 순서로 부르세요.

1. 영향받는 **파일마다** `registry.rename(from, to)` 또는 `registry.remove(path)`. 폴더를 바꿨다면 그 안의 파일 전부가 대상입니다. `@codefold/virtual-fs`의 `rename`·`delete`가 돌려주는 목록을 그대로 쓰면 됩니다.
2. 그다음 트리 변경 하나당 **한 번** `tracker.recordTreeChange(change, structureVersion)`. `structureVersion`은 변경한 뒤의 구조 버전입니다. 구조 버전은 virtual-fs가 트리를 바꿀 때마다 1씩 올리는 번호로, `structureVersion()`으로 얻습니다.

폴더 이름을 바꾸면 다음처럼 씁니다. virtual-fs가 돌려주는 목록에는 폴더 자신도 들어 있지만, 폴더 경로에는 model이 없어 `registry.rename`이 아무 일도 하지 않으므로 그대로 돌려도 됩니다.

```ts
for (const { from, to } of fs.rename('src', 'lib')) registry.rename(from, to);
tracker.recordTreeChange({ type: 'rename', from: 'src', to: 'lib' }, fs.structureVersion());
```

파일을 새로 만들 때도 `recordTreeChange({ type: 'add', path }, structureVersion)`를 부르세요. 구조 버전은 변경할 때마다 커지는 1 이상의 수여야 합니다. virtual-fs의 `structureVersion()`을 그대로 넘기면 이 조건을 지킵니다. virtual-fs의 `TreeChange`는 `StructureChange`로 그대로 넘길 수 있습니다. 이 패키지는 `add`의 `isDirectory`를 읽지 않습니다. 반대로 `StructureChange`에는 `isDirectory`가 없어서 `TreeChange`로 넘길 수는 없습니다.

### 4. 다운로드 앞뒤로 기록합니다

내보내기 계획을 만들 때 `tracker.snapshot()`을 얻어 두고, 다운로드가 **성공한 뒤에** `tracker.markExported(snapshot)`를 부르세요. 내보내기 계획은 다운로드할 ZIP에 넣을 항목 목록으로, virtual-fs의 `exportEntries`가 돌려줍니다. 어떤 파일이 고쳐졌는지는 `registry.dirtyPaths()`로 얻고, 그 파일의 내용은 `registry.get(path).getValue()`로 읽습니다.

### 5. 복원할 때 지문을 비교합니다

페이지를 새로고침한 뒤 작업을 복원했다면, 저장해 둔 다운로드 기록의 지문과 지금 내용의 지문을 비교하고, 그 결과를 `adoptRestoredExport`에 넘기세요. 지문을 저장하고 계산하는 일은 쓰는 쪽이 합니다. 자세한 순서는 [페이지를 새로고침한 뒤 복원할 때](#페이지를-새로고침한-뒤-복원할-때)에 있습니다.

### 6. 정리할 때 순서를 지킵니다

분할 화면 하나를 닫을 때는 그 그룹에 열려 있던 탭마다 `registry.release(path)`를 부른 뒤 `group.dispose()`를 부르세요. `dispose`는 탭 수를 내리지 않으므로, 빠뜨리면 model이 남습니다.

에디터 전체를 닫을 때는 **그룹 → 추적기 → 등록부** 순서로 `dispose`합니다. 등록부의 `dispose`는 알림 없이 model을 지웁니다. 그래서 등록부를 먼저 지우면 그룹은 사라진 파일을 계속 보고 있다고 여깁니다(`current()`가 옛 경로를 돌려줍니다). 지운 등록부는 다시 쓰지 마세요.

## 상황별 결과

흔히 만나는 상황마다 어떤 결과가 나오는지 모았습니다.

| 상황 | 결과 |
|---|---|
| 파일을 열고 한 글자 입력 | 수정됨, 받지 않은 변경 1개 |
| 이어서 100글자 더 입력 | 알림 없음 |
| undo로 원본까지 돌아감 | 수정 안 됨, 받지 않은 변경 0개 |
| 고친 파일을 다운로드함 | 여전히 수정됨, 받지 않은 변경 0개 |
| 다운로드한 뒤 더 입력 | 받지 않은 변경 1개 |
| 다운로드한 뒤 입력했다가 undo로 다운로드했던 상태로 돌아감 | 받지 않은 변경 0개 |
| 고친 파일의 탭을 닫음 | model이 남습니다. 다시 열면 내용과 undo가 이어집니다. |
| 안 고친 파일의 마지막 탭을 닫음 | model을 지웁니다. |
| 같은 파일을 두 분할 화면에 띄우고 한쪽 탭만 닫음 | model이 남습니다. |
| 보고 있는 파일의 이름을 바꿈 | 화면이 새 model로 바뀌고 커서 위치가 남습니다. |
| 고친 파일의 이름을 바꿈 | 새 이름에서도 수정됨 상태입니다. undo로 원본에 돌아갈 수 없습니다. |
| 보고 있는 파일을 원본으로 되돌림 | 화면이 원본 내용으로 바뀌고 수정 표시가 사라집니다. undo로 고친 내용을 되살릴 수 없습니다. |
| 보고 있는 파일을 지움 | 빈 에디터가 됩니다. |
| 분할 화면 둘에서 각각 Ctrl/Cmd+Z | 각 화면의 파일만 되돌립니다. |
| 다운로드한 뒤 undo를 더 해서 원본까지 돌아감 | 수정 안 됨, 받지 않은 변경 1개 |
| ZIP을 만드는 동안 입력 | 다운로드가 끝난 뒤에도 받지 않은 변경 1개 |
| 고친 파일 셋이 든 폴더의 이름을 바꿈 | 파일 셋 모두 새 경로에서 수정됨, 받지 않은 변경 1개 |
| 분할 화면 하나를 닫음 | `release`를 부르지 않으면 model이 남습니다. |

## API 레퍼런스

공개 함수는 여섯 개입니다. 부품 셋을 만드는 함수 셋, worker 설정을 만드는 함수 하나, 단축키 값을 주는 함수 둘입니다. 만든 객체의 메서드는 떼어 콜백으로 넘겨도 동작합니다.

| 함수 | 돌려주는 값 |
|---|---|
| `createModelRegistry(monaco)` | `ModelRegistry` |
| `createEditorGroup(monaco, registry, container, options?)` | `EditorGroup` |
| `createUnexportedTracker(registry)` | `UnexportedTracker` |
| `createWorkerEnvironment(createWorker)` | Monaco worker 설정 객체 |
| `undoKeybinding(monaco)`, `redoKeybinding(monaco)` | 단축키 값(숫자) |

### `ModelRegistry`

| 멤버 | 설명 |
|---|---|
| `open(path, text)` | model을 돌려줍니다. 없으면 `text`로 만듭니다. |
| `get(path)` | model을 돌려줍니다. 없으면 `undefined`입니다. |
| `isDirty(path)` | 원본과 달라졌는지. model이 없으면 `false`입니다. |
| `dirtyPaths()` | 원본과 달라진 파일의 경로 목록 |
| `acquire(path)` / `release(path)` | 탭이 열릴 때 / 닫힐 때 부릅니다. |
| `remove(path)` | 파일을 지웠을 때 부릅니다. model을 지웁니다. |
| `rename(from, to)` | 이름을 바꿨을 때 부릅니다. 새 URI로 model을 다시 만듭니다. |
| `revert(path, originalText)` | 원본으로 되돌립니다. |
| `markDirty(path)` | 내용은 그대로 두고 수정됨 상태로 만듭니다. |
| `onDirtyChange(listener)` | 수정 여부가 바뀔 때 `(path, dirty)`로 부릅니다. |
| `onDidReplaceModel(listener)` | model을 새로 만들거나 지울 때 `{ from, to }`로 부릅니다. |
| `dispose()` | 모든 model을 지우고 알림을 멈춥니다. |

### `EditorGroup`

[에디터 그룹](#에디터-그룹)의 표를 보세요.

### `UnexportedTracker`

| 멤버 | 설명 |
|---|---|
| `state()` | `{ has, count }` |
| `paths()` | 받지 않은 변경이 있는 경로 목록 |
| `snapshot()` | 지금의 버전 기록(`ExportSnapshot`). 내보내기 계획을 만들 때 받습니다. |
| `markExported(snapshot)` | 다운로드가 성공했을 때 부릅니다. |
| `adoptRestoredExport({ versions, changedPaths })` | 복원한 뒤 지문 비교 결과로 기록을 옮깁니다. |
| `recordTreeChange(change, structureVersion)` | 트리 구조가 바뀌었을 때 부릅니다. |
| `onChange(listener)` | `has`나 `count`가 바뀔 때 부릅니다. |
| `dispose()` | 등록부 구독을 끊습니다. |

### 타입

이 패키지가 내보내는 타입입니다.

| 타입 | 설명 |
|---|---|
| `MonacoApi` | 넘겨야 하는 Monaco 객체. `editor`, `Uri`, `KeyMod`, `KeyCode`만 씁니다. |
| `TextModel`, `CodeEditor`, `EditorOptions`, `MonacoEnvironmentConfig` | Monaco 타입의 별칭 |
| `ModelReplacedEvent` | `onDidReplaceModel`이 받는 값. `{ from, to }` |
| `EditorGroupOptions` | `{ editorOptions? }` |
| `StructureChange` | 트리 변경. `add`, `delete`, `rename` 세 종류 |
| `ExportSnapshot` | `snapshot()`의 결과. `{ versions, structureVersion }`. 순수 데이터입니다. |
| `UnexportedState` | `{ has, count }` |
| `RestoredExport` | `adoptRestoredExport`에 넘기는 값. `{ versions, changedPaths }` |
| `WorkerFactory` | `(label) => Worker` |
| `Disposable` | `{ dispose() }` |

## 성능

성능은 키를 누를 때마다 하는 일에서 갈립니다. 이 패키지는 입력 한 번에 다음만 합니다.

- 등록부: 그 파일의 버전 번호와 원본 버전을 **정수 하나 비교**합니다. 결과가 바뀔 때만 알립니다.
- 추적기: **다운로드 기록에 있는 파일에만** 입력 알림을 구독합니다. 기록에 없는 파일에 입력할 때는 추적기가 아무 일도 하지 않습니다.

그래서 입력 1,000번에 수정 알림은 한 번이고, 화면을 다시 그릴 일도 그때 한 번뿐입니다. 전체 내용 비교는 다운로드할 때만 합니다.

## 한계

쓰기 전에 아래 한계를 알아 두세요.

- **고친 파일의 이름을 바꾸면 그 뒤로는 계속 수정됨 상태입니다.** model을 새로 만들면서 undo 기록이 끊겨 원본으로 돌아갈 수 없기 때문입니다. 내용이 실제로 원본과 같은지는 다운로드를 만드는 쪽이 다운로드할 때 비교합니다.
- **원본으로 되돌리면 고친 내용을 undo로 되살릴 수 없습니다.** model을 새로 만들기 때문입니다.
- **같은 URI의 model을 다른 곳에서 이미 만들었다면 Monaco 자체의 오류가 그대로 납니다.** 한 페이지에 등록부를 두 개 만들거나, 개발 중 코드 교체(HMR)로 등록부가 두 번 만들어질 때 생길 수 있습니다.
- **실제 키 입력은 단위 테스트로 확인하지 못합니다.** 테스트 환경(jsdom)에서는 가짜 키 이벤트가 Monaco에 닿지 않습니다. 그래서 단축키가 등록됐는지, 그 명령이 undo·redo를 부르는지까지만 봅니다. 실제 키 입력은 앱의 Playwright E2E 테스트(SC-8, SC-26)에서 확인합니다.
- **언어 등록, TypeScript 설정, 큰 파일 안내는 이 패키지 밖입니다.** `@codefold/react-code-editor`가 맡습니다.

## 테스트

```sh
pnpm --filter @codefold/monaco-binding test
```

가짜 Monaco가 아니라 **실제 `monaco-editor` 0.57**을 Vitest와 jsdom에서 돌립니다. jsdom에 없는 브라우저 기능(`matchMedia`, `ResizeObserver`)만 [test/setup.ts](test/setup.ts)에서 채웁니다. 테스트 파일마다 확인하는 내용은 다음과 같습니다.

| 파일 | 확인하는 것 |
|---|---|
| [registry.test.ts](test/registry.test.ts) | 열기와 URI, 수정 여부 알림(입력 1,000번에 한 번), 탭 수와 model 수명, 삭제, 정리 |
| [registry-replace.test.ts](test/registry-replace.test.ts) | 이름 변경(내용·탭 수·수정 여부 옮기기, undo 끊김), 이미 있는 경로, 되돌리기 |
| [editor-group.test.ts](test/editor-group.test.ts) | 탭 전환과 커서 되살리기, 파일별 undo, 분할 화면의 model 공유, model이 바뀔 때 화면, 단축키 등록, StrictMode 수명 |
| [unexported.test.ts](test/unexported.test.ts) | 받지 않은 변경의 네 조건, 개수 세기, 다운로드 중 변경, 복원, 입력 비용 |
| [mark-dirty.test.ts](test/mark-dirty.test.ts) | `markDirty`가 내용은 두고 수정됨으로 만드는지, undo로도 원본 상태가 되지 않는지, model이 없을 때 오류 |
| [restored-paths.test.ts](test/restored-paths.test.ts) | 복원 때 받은 경로(`changedPaths`)가 이름 변경·삭제를 따라가는지, 폴더를 1개로 세는지 |
| [review-fixes.test.ts](test/review-fixes.test.ts) | 단축키가 자기 에디터에만 걸리는지, 되돌린 뒤 버전이 우연히 같아지는 경우, undo 묶음 끊기, 폴더를 1개로 세기, 다운로드 중 이름 변경 |
| [worker-environment.test.ts](test/worker-environment.test.ts) | worker 설정, 전역을 건드리지 않는지, 구독자 오류 격리, 오류 class |
| [public-api.test.ts](test/public-api.test.ts) | 공개 API 목록, 전역 설정을 건드리지 않는지, 메서드를 떼어 써도 동작하는지 |

## 관련 결정 기록

왜 이렇게 설계했는지는 아래 문서에 있습니다.

- [ADR-0006](../../docs/adr/0006-monaco-model-as-content-source.md): 파일 내용의 원본을 Monaco model로 두고, 수정 여부를 버전 번호로 비교하는 결정
- [ADR-0007](../../docs/adr/0007-dockview-editor-area.md): 분할 화면(그룹)마다 에디터 하나, 파일마다 model 하나로 두는 결정
- [ADR-0008](../../docs/adr/0008-autosave-working-copy.md): 저장 개념 없이 고친 내용을 곧 작업본으로 삼는 결정
- [ADR-0009](../../docs/adr/0009-modified-vs-unexported-state.md): "원본과 달라짐"과 "다운로드 뒤 또 고침"을 따로 관리하는 결정
- [ADR-0012](../../docs/adr/0012-file-tree-operations.md): 이름을 바꾸면 새 URI로 model을 다시 만들고, 그 파일의 undo 기록이 끊기는 결정
- [ADR-0017](../../docs/adr/0017-factory-interfaces-and-plain-data.md): 팩토리 함수와 순수 데이터, `Error` 하위 class 규칙
- [ADR-0021](../../docs/adr/0021-monaco-direct-without-wrapper.md): Monaco를 React 래퍼 없이 직접 쓰고, undo·redo 단축키를 명시하는 결정
- [ADR-0024](../../docs/adr/0024-single-tab-edit-lock.md): 편집 권한을 브라우저 탭 하나에만 주는 결정으로, 읽기 전용 에디터에서 단축키를 막는 근거입니다.
- [ADR-0025](../../docs/adr/0025-download-record-content-hash.md): 페이지를 새로고침한 뒤에도 다운로드 기록을 지문으로 이어 가는 결정
