# @codefold/react-code-editor

파일 트리, 탭, 분할 화면, Monaco 에디터를 한데 묶은 **완성형 코드 에디터 React 컴포넌트**입니다. `<CodeEditor>` 하나를 화면에 놓고 파일 출처만 넘기면, 파일을 열어 고치고 추가·삭제·이름 변경까지 할 수 있습니다. 다운로드와 자동 저장은 앱마다 방식이 달라 앱이 직접 하고, 이 패키지는 그때 쓸 제어 API(앱이 바깥에서 에디터를 다루는 메서드 모음)를 줍니다.

이 저장소에는 헤드리스 패키지(화면 없이 기능만 주는 패키지)가 네 개 있고, 이 컴포넌트는 그 가운데 세 개를 조립해 만들었습니다.

| 패키지 | 이 컴포넌트에서 맡는 일 |
|---|---|
| [`@codefold/virtual-fs`](../virtual-fs/README.md) | 트리, 추가·삭제·이름 변경, 내보내기 계획 |
| [`@codefold/monaco-binding`](../monaco-binding/README.md) | 파일별 Monaco model(파일 내용과 undo 기록을 담는 Monaco 객체), 수정 여부, 받지 않은 변경 |
| [`@codefold/file-type-detector`](../file-type-detector/README.md) | 텍스트·이미지·바이너리 판단, 인코딩 |
| [`@codefold/zip-archive`](../zip-archive/README.md) | 이 패키지는 쓰지 않습니다. 앱이 ZIP을 열어 파일 출처로 넘깁니다. |

## 목차

- [왜 필요한가](#왜-필요한가)
- [먼저 알아 둘 개념](#먼저-알아-둘-개념)
- [설치와 준비](#설치와-준비)
- [가장 짧은 사용 예](#가장-짧은-사용-예)
- [화면 구성](#화면-구성)
- [파일 트리](#파일-트리)
- [에디터 영역](#에디터-영역)
- [파일 종류별 보기](#파일-종류별-보기)
- [다운로드](#다운로드)
- [자동 저장과 복원](#자동-저장과-복원)
- [편집 잠금](#편집-잠금)
- [테마와 문구](#테마와-문구)
- [좁은 화면](#좁은-화면)
- [조각으로 쓰기](#조각으로-쓰기)
- [오류](#오류)
- [쓰는 쪽이 꼭 처리해야 할 것](#쓰는-쪽이-꼭-처리해야-할-것)
- [상황별 결과](#상황별-결과)
- [API 레퍼런스](#api-레퍼런스)
- [크기와 성능](#크기와-성능)
- [한계](#한계)
- [테스트](#테스트)
- [관련 결정 기록](#관련-결정-기록)

## 왜 필요한가

헤드리스 패키지 네 개는 각자 한 가지 일만 합니다. 그래서 그대로 가져다 쓰려면, 쓰는 쪽이 이들을 **정해진 순서로** 이어 붙여야 합니다. 예를 들어 폴더 이름을 바꾸면 다음 일을 빠짐없이, 이 순서대로 해야 합니다.

1. virtual-fs에서 이름을 바꾸고
2. 안의 파일마다 Monaco model을 새 경로로 옮기고
3. 열린 탭의 제목과 경로를 바꾸고
4. 받지 않은 변경 추적기에 트리 변경을 알리고
5. 트리 화면을 다시 그립니다.

하나라도 빠지거나 순서가 틀리면 탭은 옛 경로를 보고, 수정 표시가 사라지고, 다운로드한 ZIP에서 파일이 빠집니다. 이 패키지는 이 조립을 안에서 끝내 두었고, 쓰는 방법은 다음 두 가지입니다.

- **`<CodeEditor>`**: 트리·탭·분할 화면·파일 보기를 모두 갖춘 완성형 컴포넌트입니다. 대부분은 이것만 쓰면 됩니다.
- **조각**: `<CodeEditor>`를 이루는 부품인 `FileTree`, `FileTreePanel`, `EditorArea`, `createEditorWorkspace`입니다. 화면 배치를 직접 짜고 싶을 때 씁니다.

반대로 이 패키지가 **하지 않는** 일도 분명히 나눠 두었습니다. ZIP 열기·만들기, 파일 다운로드, IndexedDB 자동 저장, 여러 탭의 편집 잠금은 앱이 합니다. 앱마다 저장소와 정책이 다르기 때문입니다.

## 먼저 알아 둘 개념

이 문서에 자주 나오는 용어를 먼저 풀어 둡니다. **앱**과 **쓰는 쪽**은 모두 이 패키지를 가져다 쓰는 프로그램(과 그 개발자)을 가리키고, **이 프로젝트의 앱**은 이 저장소에 든 앱을 가리킵니다.

### 파일 출처(FileSource)

에디터가 원본 파일을 가져오는 곳입니다. `list()`(파일·폴더 목록 주기), `readHead(path, bytes)`(파일 앞부분 읽기), `readAll(path)`(파일 전체 읽기) 세 함수만 갖춘 객체면 됩니다. 자세한 모양은 [virtual-fs README](../virtual-fs/README.md#파일-출처filesource)에 있습니다. 이 프로젝트의 앱은 ZIP Worker를 감싼 객체를 파일 출처로 넘깁니다.

### 작업 공간

**작업 공간**은 파일 출처 하나를 열어 만든 편집 상태 전체입니다. 트리(virtual-fs), 파일마다의 model(monaco-binding), 받지 않은 변경 추적기, 화면 상태(펼친 폴더, 활성 탭 등)가 들어 있습니다. `<CodeEditor>`는 `source`가 바뀔 때마다 작업 공간을 새로 만듭니다. 새 ZIP을 열면 작업 공간도 새로 만들어집니다.

### 제어 API(CodeEditorController)

앱이 에디터 바깥에서 에디터를 다루는 창구입니다. `onReady`로 한 번 받습니다. 다운로드 계획 만들기, 자동 저장용 스냅샷 받기, 변경 알림 구독, 편집 잠금 걸기를 이것으로 합니다. 안쪽 부품(virtual-fs, 파일마다 model을 관리하는 등록부, 받지 않은 변경 추적기)은 드러내지 않습니다. 앱이 순서를 어겨 상태가 어긋나는 일을 막으려는 것입니다.

### 수정 여부와 받지 않은 변경

두 가지는 다릅니다([monaco-binding README](../monaco-binding/README.md#수정-여부dirty)).

- **수정 여부**: 파일이 원본과 달라졌는지입니다. 원본과 달라진 파일을 "수정됨" 상태라고 하고, 트리와 탭에 수정 표시(●)를 붙입니다. 다운로드해도 사라지지 않습니다.
- **받지 않은 변경**: 마지막으로 다운로드한 뒤에 새로 생긴 변경입니다. 파일 내용 수정과 트리 변경을 모두 세고, 다운로드한 적이 없으면 원본에서 바뀐 것 전부가 여기에 듭니다. 페이지를 떠날 때의 경고와 다운로드 버튼 옆 개수에 씁니다. 다운로드하면 0이 됩니다.

여기에 하나가 더 있습니다. **바뀐 것이 있는지**(`hasChanges`)는 원본과 달라진 파일이 있거나 트리 구조를 한 번이라도 바꿨는지입니다. 다운로드 버튼을 켤지 정할 때 씁니다.

### 에디터 영역, 그룹, 탭

오른쪽의 편집 화면을 **에디터 영역**이라고 합니다. [dockview](https://dockview.dev) 라이브러리로 그립니다.

- **탭**: 열린 파일 하나입니다.
- **그룹**: 탭을 모은 칸 하나입니다. 화면을 나눈 상태를 분할 화면이라고 하며, 나누면 그룹이 둘이 됩니다. 그룹마다 Monaco 에디터가 **하나**만 있고, 탭을 바꾸면 에디터는 그대로 두고 보여 줄 model만 바꿉니다.

### 스냅샷(WorkspaceSnapshot)

자동 저장을 위해 지금 상태를 순수 데이터(함수나 객체 참조 없이 그대로 저장하거나 보낼 수 있는 값)로 뽑은 것입니다. 파일 내용을 전부 담지 않고, 복원에 꼭 필요한 것만 담습니다.

| 필드 | 담는 것 |
|---|---|
| `treeChanges` | 지금까지의 트리 변경 기록. 원본에 다시 적용하면 같은 트리가 나옵니다. |
| `contents` | 원본과 달라진 텍스트 파일의 내용만 |
| `layout` | 에디터 영역 배치(dockview JSON). 어떤 탭이 어느 그룹에 열려 있었는지 |
| `downloadRecord` | 마지막 다운로드 기록. 받은 적이 없으면 `null` |

### 내보내기 계획과 다운로드 기록

- **내보내기 계획(ExportPlan)**: 다운로드할 ZIP에 넣을 항목 목록에, 계획을 만든 순간의 버전과 지문(바로 아래 설명)을 더한 것입니다. 순수 데이터라 ZIP Worker로 그대로 보냅니다.
- **다운로드 기록(DownloadRecord)**: 다운로드가 성공한 뒤 남기는 기록입니다. 파일 내용 대신 **지문**(SHA-256 해시)만 담습니다. 페이지를 새로고침한 뒤에도 "다운로드한 뒤 더 고쳤는지"를 알기 위해 씁니다.

## 설치와 준비

### 함께 설치할 것

`react`와 `react-dom`(19 이상), `monaco-editor`(0.56 이상)는 쓰는 쪽이 설치합니다. 0.56 이상이어야 하는 까닭은 이 패키지가 0.55부터 생긴 `monaco.typescript`를 쓰고, 함께 쓰는 monaco-binding이 0.56부터 생긴 가져오기 경로를 쓰기 때문입니다. 이 패키지는 이들을 번들에 넣지 않습니다. dockview, Radix UI, Zustand 같은 나머지 의존성은 함께 설치됩니다.

### 스타일

앱의 진입 파일에서 CSS 한 줄을 불러옵니다. dockview의 CSS도 여기에 들어 있습니다.

```ts
import '@codefold/react-code-editor/styles.css';
```

이 CSS는 쓰는 쪽 페이지를 건드리지 않도록 만들었습니다.

- 클래스에는 모두 접두어 `cf`가 붙습니다(예: `cf:flex`).
- Tailwind가 기본으로 넣는 브라우저 스타일 초기화 규칙(preflight)을 넣지 않습니다. 쓰는 쪽의 `button`, `h1` 같은 기본 스타일이 바뀌지 않습니다.
- 색과 모서리 크기는 `--cf-*` CSS 변수로 정합니다. 쓰는 쪽에 shadcn/ui 변수(`--background`, `--foreground` 등)가 있으면 그 값을 따릅니다.

### 높이

`<CodeEditor>`를 담는 요소에는 **정해진 높이**가 있어야 합니다. 트리는 보이는 줄만 그리는데(가상화), 그러려면 자기 높이를 알아야 합니다. dockview도 그 높이를 나눠 씁니다. 높이가 없으면 트리가 모든 줄을 한 번에 그리고, 에디터 영역은 높이 0으로 접힙니다.

```tsx
<div style={{ height: '100dvh' }}>
  <CodeEditor … />
</div>
```

### Monaco worker 함수

Monaco는 자동 완성과 오류 표시를 Web Worker(화면과 따로 실행되는 백그라운드 스레드)에서 합니다. worker 파일을 만드는 방법은 번들러마다 달라서, 쓰는 쪽이 "언어 이름을 받아 Worker를 만드는 함수"를 `createWorker`로 넘깁니다. Vite 예시는 [monaco-binding README의 worker 설정](../monaco-binding/README.md#worker-설정)에 있습니다. 쓰는 쪽이 전역 `self.MonacoEnvironment`를 이미 설정해 두었으면 에디터는 그 설정을 그대로 쓰고, `createWorker`로 넘긴 함수는 쓰지 않습니다.

## 가장 짧은 사용 예

ZIP에서 만든 파일 출처를 에디터에 띄우고, 받지 않은 변경 개수를 보여 주는 다운로드 버튼을 붙이는 예입니다.

```tsx
import '@codefold/react-code-editor/styles.css';
import { CodeEditor, type CodeEditorController } from '@codefold/react-code-editor';
import type { FileSource } from '@codefold/virtual-fs';
import { useRef, useState } from 'react';

function App({ source }: { source: FileSource }) {
  const controller = useRef<CodeEditorController>(undefined);
  const [unexported, setUnexported] = useState(0);

  const handleReady = (next: CodeEditorController) => {
    controller.current = next;
    setUnexported(next.getUnexportedCount());                     // 첫 값은 직접 읽는다(복원 직후 0이 아닐 수 있다)
    next.onUnexportedChange(({ count }) => setUnexported(count)); // 그다음은 바뀔 때만 온다
  };

  const download = async () => {
    const editor = controller.current;
    if (!editor) return;
    const request = await editor.createExportPlan(); // ① 계획과 새로 쓸 바이트
    const blob = await zipWorker.exportZip(request);  // ② ZIP 만들기는 앱이 한다
    saveFile(blob, 'project.zip');
    const record = editor.markExported(request.plan); // ③ 성공한 뒤에만 기록한다
    saveDownloadRecord(record);                       // ④ 다운로드 기록도 저장한다
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <button onClick={download}>다운로드{unexported > 0 ? ` (${unexported})` : ''}</button>
      <CodeEditor source={source} createWorker={makeWorker} onReady={handleReady} />
    </div>
  );
}
```

`source`, `zipWorker`, `saveFile`, `saveDownloadRecord`, `makeWorker`는 이 예시에서 따로 정의하지 않은 이름입니다. 실제 구현은 쓰는 쪽이 준비합니다.

알아 둘 점은 다음과 같습니다.

- `FileSource`, `TreeChange`처럼 헤드리스 패키지에 있는 타입은 이 패키지가 다시 내보내지 않습니다. `@codefold/virtual-fs`, `@codefold/monaco-binding`에서 가져오세요.
- `source`를 바꾸면 새 작업 공간이 생기고, 에디터가 새 제어 API를 넘겨 `onReady`를 다시 부릅니다. 앞 제어 API는 정리된 작업 공간을 가리키므로 더 쓰지 마세요. 그 구독에도 알림이 더는 오지 않습니다.

## 화면 구성

`<CodeEditor>`는 왼쪽에 파일 트리, 오른쪽에 에디터 영역을 그립니다.

```
┌──────────────┬───────────────────────────────────────────┐
│ [+파일][+폴더]│ main.py ● │ utils.py ×        [⇥]        │ ← 탭, 그룹 버튼
│ ▾ src      ● │───────────────────────────────────────────│
│   ● main.py  │ 1  import utils                           │
│     utils.py │ 2  print(utils.add(1, 2))                 │ ← 그룹마다 Monaco 하나
│ ▸ data       │                                           │
│   README.md  │                                           │
└──────────────┴───────────────────────────────────────────┘
  파일 트리            에디터 영역 (dockview)
```

Monaco는 `<CodeEditor>`가 처음 화면에 붙을 때, 곧 마운트될 때 한 번만 불러옵니다(`import('monaco-editor')`). 그래서 첫 화면 번들에 Monaco가 들어가지 않습니다. 불러오는 동안에는 "에디터를 불러오는 중이에요"가 보입니다. 불러오기에 실패하면 다음에 다시 붙을 때 다시 시도합니다.

불러온 뒤 Monaco를 다음과 같이 설정합니다.

- Monaco에 들어 있는 구문 강조 언어 전부와, 자동 완성·오류 검사까지 해 주는 언어 서비스 4종(TypeScript/JavaScript, JSON, CSS, HTML)을 등록합니다. 실제 규칙은 그 언어 파일을 처음 열 때 불러옵니다.
- TypeScript와 JavaScript는 열린 파일 전체를 한 프로젝트로 봅니다. 그래서 열린 다른 파일의 함수도 자동 완성에 나옵니다. JSX(`react-jsx`), JavaScript 파일(`allowJs`), 최신 문법(`ESNext`)을 켭니다.
- 그 밖의 언어는 열린 모든 파일의 단어를 자동 완성 후보로 씁니다.
- 스크린 리더를 감지하면 스크린 리더 모드를 켭니다.

## 파일 트리

펼친 폴더만 한 줄 목록으로 만들고, 화면에 보이는 줄만 그립니다. 1만 개가 넘는 파일도 부드럽게 스크롤됩니다. 폴더를 파일보다 앞에 두고, 이름은 숫자를 크기대로 비교하는 자연 정렬로 늘어놓습니다(`file2`가 `file10`보다 앞). 고친 파일에는 수정 표시가, 고친 파일이 든 폴더에는 작은 표시가 붙습니다.

파일 아이콘은 확장자로 짐작한 종류(텍스트, 이미지, 바이너리)에 따라 다릅니다. 트리를 그릴 때는 파일 내용을 읽지 않으므로, 실제 종류는 파일을 열 때 정합니다. 그래서 아이콘과 실제 보기가 다를 수 있습니다.

### 키보드

트리는 웹 접근성 표준 WAI-ARIA의 트리 패턴(키보드로 트리를 다루는 약속)을 따릅니다. 트리에 포커스를 두고 다음 키를 씁니다.

| 키 | 동작 |
|---|---|
| ↓ / ↑ | 다음 / 이전 줄로 |
| Home / End | 첫 줄 / 마지막 줄로 |
| → | 닫힌 폴더를 펼칩니다. 펼친 폴더면 첫 자식으로 갑니다. 빈 폴더면 포커스가 그대로 있습니다. |
| ← | 펼친 폴더를 접습니다. 아니면 부모 폴더로 갑니다. |
| Enter | 폴더면 펼치거나 접고, 파일이면 탭으로 엽니다. |
| F2 | 이름 바꾸기 |
| Delete | 삭제 |
| Shift+F10 / 메뉴 키 | 브라우저가 오른쪽 클릭 이벤트를 보내 주는 환경(주로 Windows·Linux)에서 오른쪽 클릭 메뉴가 열립니다. 트리가 이 키를 따로 처리하지는 않습니다. |

### 도구 모음과 오른쪽 클릭 메뉴

트리 위의 도구 모음에는 "새 파일", "새 폴더" 버튼이 있습니다. 트리를 오른쪽 클릭하면 새 파일, 새 폴더, 이름 바꾸기, 삭제, 변경 되돌리기 메뉴가 나옵니다.

- **메뉴의 대상**: 줄을 오른쪽 클릭하면 그 줄이 포커스를 받고 메뉴의 대상이 됩니다. 줄이 없는 빈 곳을 오른쪽 클릭하면 대상은 맨 위 폴더(최상위)입니다. 이때 이름 바꾸기와 삭제는 꺼집니다.
- **새로 만들 위치**: 포커스된 줄이 폴더면 그 안, 파일이면 그 파일의 부모 폴더, 포커스된 줄이 없으면 최상위에 만듭니다.
- **새로 만들기·이름 바꾸기**는 트리 안에 입력칸을 띄웁니다. 입력하는 동안 이름을 검사해, 쓸 수 없으면 이유를 입력칸 아래에 보입니다. 쓸 수 없는 이름은 빈 이름, `.`·`..`, `/`·`\`·제어 문자가 든 이름, 그리고 같은 폴더에 이미 있는 이름입니다. 대소문자만 다른 이름도 이미 있는 이름으로 봅니다. 트리에는 안 보이지만 다운로드할 ZIP에는 들어가는 숨긴 항목(`.DS_Store` 등)의 이름도 마찬가지입니다. Enter로 확정하고, Esc를 누르거나 입력칸 밖을 누르면 취소합니다.
- **새 파일**을 만들면 빈 UTF-8 파일로 만들고 곧바로 탭으로 엽니다.
- **삭제**는 그 항목(폴더면 그 안)에 **고친 파일이 있을 때만** 확인창을 띄웁니다. 안 고친 파일은 바로 지웁니다.
- **변경 되돌리기**는 포커스된 줄이 고친 파일일 때만 켜집니다. 누르면 늘 확인창을 띄웁니다. 되돌리면 고친 내용을 undo로도 되살릴 수 없기 때문입니다.
- 끌어서 옮기기는 없습니다. 이름 변경은 같은 폴더 안에서만 됩니다.

확인창은 Radix의 AlertDialog로 띄웁니다. 쓰는 쪽이 nice-modal 같은 모달 관리자를 쓰든 안 쓰든, 이 확인창은 그 관리자와 상관없이 따로 뜹니다.

## 에디터 영역

### 탭

- 탭에는 파일 이름, 수정 표시, 닫기 버튼이 있습니다. 스크린 리더는 수정 표시를 "수정됨"으로 읽습니다.
- 이름이 같은 다른 파일이 함께 열려 있으면 `index.ts — src/a`처럼 부모 경로를 붙여 구분합니다.
- 트리에서 이미 열린 파일을 고르면 새 탭을 만들지 않고 그 탭을 활성화합니다.
- 활성 탭이 바뀌면 트리가 그 파일까지 폴더를 펼쳐 보여 줍니다.

### 나누기

그룹 맨 위, 탭이 늘어선 줄의 오른쪽 끝에 버튼이 하나 있습니다.

| 버튼 | 동작 |
|---|---|
| 오른쪽으로 나누기 | 활성 탭의 파일을 오른쪽 새 그룹에 하나 더 엽니다. 두 그룹은 같은 model을 쓰므로 한쪽에서 친 글자가 다른 쪽에도 바로 보입니다. 커서와 스크롤은 그룹마다 따로입니다. |

에디터 영역 전체의 폭이 480px보다 좁으면 이 버튼을 감춥니다. 그렇게 좁은 화면에서는 나눠도 쓸 수 없기 때문입니다. 기준은 그룹 하나의 폭이 아니라 에디터 영역 전체의 폭입니다.

탭을 끌어서 다른 그룹으로 옮기거나 영역 가장자리에 놓아 새 그룹을 만들 수도 있습니다(dockview 기본 동작). 영역 위에 창처럼 떠 있는 그룹은 두지 않습니다([ADR-0042](../../docs/adr/0042-remove-floating-groups.md)). 떠 있는 그룹이 든 옛 레이아웃을 `restoreLayout`에 넘기면, 떠 있던 탭은 활성 그룹에 열립니다.

### 탭과 model의 수명

에디터는 model마다 그 파일을 연 탭 수를 세어, 탭이 생기면 하나 올리고 사라지면 하나 내립니다. 그래서 다음처럼 동작합니다.

| 상황 | model |
|---|---|
| 안 고친 파일의 마지막 탭을 닫음 | 지워서 메모리를 비웁니다. |
| 고친 파일의 마지막 탭을 닫음 | 남깁니다. 다시 열면 고친 내용과 undo 기록이 이어집니다. |
| 같은 파일이 다른 그룹에 열려 있음 | 남깁니다. |

탭을 바꿔도 에디터를 새로 만들지 않으므로, 파일마다 커서·스크롤·접힘 위치가 되살아납니다. 이 위치는 그룹마다 따로 저장됩니다. undo 기록은 model에 들어 있으므로 파일마다 하나입니다. 그래서 두 그룹에 연 같은 파일은 undo 기록도 함께 씁니다.

## 파일 종류별 보기

파일을 열면 앞 8KB로 종류를 판단하고([file-type-detector](../file-type-detector/README.md)), 종류에 맞는 보기를 고릅니다.

| 종류 | 보기 |
|---|---|
| 텍스트 | Monaco 에디터로 엽니다. 언어는 확장자로 정합니다. |
| 이미지 | 영역 크기에 맞춰 그림을 보입니다. `alt`는 파일 이름입니다. 탭을 닫으면 그림을 보이려고 만든 임시 주소(object URL)를 해제해 메모리를 비웁니다. |
| SVG | 먼저 그림으로 보이고, "코드로 보기"를 누르면 에디터로 바꿔 고칠 수 있습니다. "이미지로 보기"로 돌아오면 고친 내용으로 다시 그립니다. 고친 SVG는 원래 인코딩으로 다운로드됩니다. 파일 전체를 글자로 읽을 수 없는 SVG는 그림으로만 보이고 "코드로 보기" 버튼이 없습니다. SVG는 `<img>`로만 그리므로 파일 안의 스크립트는 실행되지 않습니다. |
| 바이너리 | "편집할 수 없는 파일이에요"와 함께 크기와 판단 근거를 보입니다. 다운로드할 때는 원본 그대로 복사됩니다. |
| EUC-KR로 추정되는 텍스트 | 읽기 전용으로 열고 "UTF-8로 바꿔 편집" 버튼을 보입니다. 누르면 편집할 수 있고, 그 파일은 수정됨 상태가 되어 UTF-8로 다운로드됩니다. 이 선택은 페이지를 새로고침해도 남습니다. |

탭 위쪽에는 필요할 때 안내 줄이 붙습니다.

- **확장자와 내용이 다를 때**: "확장자(txt)와 달리 내용은 이미지 파일로 보여요."
- **큰 파일일 때**: Monaco가 구문 강조와 접기를 끄는 크기(약 20MB 또는 30만 줄)를 넘으면 그 사실을 알립니다. 더 커서 Monaco가 자동 완성과 오류 표시까지 끄면(약 50MB) 그것도 함께 알립니다. 넘었는지는 Monaco의 판정 함수로 가리고, 그 함수가 없으면 바이트 크기로 어림합니다.

파일을 읽는 동안 탭은 빈 화면입니다. 300ms가 넘게 걸릴 때만 "파일을 여는 중이에요"가 보입니다. 대부분의 파일은 곧바로 열리므로, 안내를 바로 띄우면 잠깐 나타났다 사라지며 깜박이기만 합니다.

파일을 읽지 못하면 그 탭에만 "파일을 읽지 못했어요"와 "다시 시도" 버튼을 보입니다. 다른 탭과 트리는 그대로 쓸 수 있습니다.

## 다운로드

다운로드는 세 단계입니다. ZIP을 만드는 ② 단계는 앱의 일입니다.

```ts
const request = await controller.createExportPlan(); // ① 계획과 새로 쓸 바이트를 만든다
const blob = await zipWorker.exportZip(request);     // ② 앱이 ZIP을 만든다 (Worker 안에서)
saveFile(blob);
const record = controller.markExported(request.plan); // ③ 성공했을 때만 부른다
```

### ① `createExportPlan()`

`{ plan, dirtyContents }`를 돌려줍니다.

- `plan.entries`: ZIP에 넣을 항목 목록입니다. 항목마다 "원본 복사(`copy`)", "새 내용(`write`)", "빈 폴더(`directory`)" 가운데 하나입니다. 규칙은 [virtual-fs의 내보내기 계획](../virtual-fs/README.md#내보내기-계획)을 따릅니다.
- `dirtyContents`: `write` 항목에 쓸 바이트입니다. 경로마다 `Uint8Array` 하나이고, 배열마다 버퍼를 따로 두어서 Worker로 복사하지 않고 소유권만 넘길 수 있습니다(transfer).

계획을 만들면서 다음을 처리합니다.

- **원래 인코딩으로 다시 씁니다.** UTF-16 파일은 UTF-16으로, BOM이 있던 파일은 BOM을 붙여 씁니다. EUC-KR만 UTF-8로 씁니다(브라우저에 EUC-KR로 쓰는 기능이 없습니다).
- **내용이 원본과 같으면 다시 쓰지 않습니다.** 고친 내용을 직접 지워서 원본과 같아진 파일은 `copy`로 두어, 원본의 압축된 바이트를 그대로 옮깁니다.
- **새로 만든 파일은 늘 `write`입니다.** 고치지 않았으면 빈 내용을 씁니다.
- **고친 파일의 지문을 계산합니다.** 지문은 다운로드 기록에 넣을 값이고, 브라우저의 `crypto.subtle`로 계산합니다.
- **계획을 만드는 동안 트리가 바뀌면 처음부터 다시 만듭니다.** 세 번 연달아 바뀌면 오류를 던집니다.

계획을 만드는 순간의 버전을 함께 기록하므로, ZIP을 만드는 동안 사용자가 더 입력한 내용은 받지 않은 변경으로 남습니다.

### ③ `markExported(plan)`

다운로드가 **성공한 뒤에만** 부르세요. 받지 않은 변경을 다시 계산하고, 저장할 다운로드 기록(`DownloadRecord`)을 돌려줍니다. 실패했거나 사용자가 취소했으면 부르지 않으면 됩니다.

돌려받은 기록은 다음 스냅샷의 `downloadRecord`에도 들어갑니다. 하지만 `markExported`는 아래 [자동 저장](#저장하기)에서 쓰는 알림(`onContentChange`·`onTreeChange`·`onLayoutChange`)을 보내지 않습니다. 그러니 돌려받은 기록은 다운로드 흐름 안에서 바로 저장하세요. 그래야 곧바로 페이지를 새로고침해도 "다운로드한 뒤 더 고쳤는지"가 맞게 나옵니다.

## 자동 저장과 복원

이 패키지는 어디에 저장할지 정하지 않습니다. 저장할 **시점**을 알리는 구독과 저장할 **내용**(스냅샷)을 주고, 실제 저장(IndexedDB 등)은 앱이 합니다.

### 저장하기

무언가 바뀌면 알림을 보내는 구독이 셋 있습니다. 이 알림을 모아 두었다가 잠시 뒤 한 번에 저장하세요. 키를 누를 때마다 저장하면 느려집니다.

```ts
let timer: ReturnType<typeof setTimeout> | undefined;
const scheduleSave = () => {
  clearTimeout(timer);
  timer = setTimeout(async () => saveToIndexedDb(await controller.getSnapshot()), 500);
};
controller.onContentChange(scheduleSave); // 입력마다, 되돌리기·UTF-8 변환 때도 온다. React 상태로 올리지 말 것
controller.onTreeChange(scheduleSave);    // 추가·삭제·이름 변경
controller.onLayoutChange(scheduleSave);  // 탭 열기·닫기·활성화·나누기, 그룹 크기 조절
```

- `onContentChange`는 **키를 누를 때마다** 불립니다. 여기서 React 상태를 바꾸면 입력마다 화면을 다시 그려 느려집니다. 타이머를 걸거나 바뀐 경로만 모아 두세요.
- 입력이 아닌 방법으로 내용이 바뀔 때도 `onContentChange`가 옵니다. "변경 되돌리기"와 "UTF-8로 바꿔 편집"이 그렇습니다.
- `onLayoutChange`는 그룹 크기를 끌어 바꾸는 동안 여러 번 올 수 있고, 같은 배치가 거듭 올 수도 있습니다. 그래서 위처럼 묶어서 저장하세요.
- 다운로드 기록은 이 알림으로 알 수 없습니다. 위 "③ `markExported(plan)`"에서 말한 대로, 돌려받은 기록을 다운로드 흐름에서 따로 저장하세요.
- 파일 몇 개만 바뀐 것을 알 때는 `getSnapshotFor(paths)`로 그 파일의 내용만 받을 수 있습니다.

### 복원하기

저장해 둔 스냅샷을 `initialSnapshot`으로 넘기면, 같은 파일 출처 위에 작업을 되살립니다. 에디터는 작업 공간을 **만들 때**(처음 붙을 때, `source`를 바꿀 때)만 `initialSnapshot`을 읽습니다. 나중에 바꿔도 지금 작업 공간에는 반영되지 않습니다.

```tsx
<CodeEditor
  source={source}
  createWorker={makeWorker}
  initialSnapshot={saved}          // 같은 ZIP으로 만든 스냅샷이어야 한다
  onError={(error) => setRestoreFailed(error)}
/>
```

스냅샷이 이 ZIP의 것인지는 **검사하지 않습니다.** 트리에 없는 경로의 내용은 오류 없이 버리고, 경로가 같은 파일은 다른 ZIP이어도 저장된 내용으로 덮습니다. 그러니 ZIP과 스냅샷을 함께 저장해 두고, 짝이 맞는 것끼리 넘기세요. 이 프로젝트의 앱도 그렇게 합니다.

복원은 다음 순서로 합니다.

1. 원본 목록에 저장된 트리 변경(`treeChanges`)을 차례로 다시 적용합니다. 다시 적용한 변경은 받지 않은 변경으로도 셉니다. 그래서 다운로드한 적이 없으면 복원 직후에도 "받지 않은 변경 있음"입니다.
2. 고친 파일마다 원본을 연 뒤, 저장된 내용을 **한 번의 편집**으로 넣습니다. 그래서 복원한 직후 undo를 한 번 하면 원본으로 돌아갑니다.
3. UTF-8로 바꿔 편집하던 EUC-KR 파일은 그 선택도 되살립니다.
4. 다운로드 기록이 있으면, 지금 내용의 지문이 기록과 같은 파일은 "받은 상태"로 봅니다. 다운로드 기록에 담긴 경로 목록과 지금 트리의 경로가 다르면, 달라진 경로를 받지 않은 변경으로 셉니다.
5. 에디터 영역의 배치를 되살립니다. 그사이 지워진 파일의 탭은 빼고, 배치 JSON이 깨졌으면 빈 영역으로 시작합니다.

복원에 실패하면 연 model을 모두 치우고 `onError`를 부릅니다. 실패하는 경우는 다음과 같습니다.

- 트리 변경을 다시 적용하지 못했습니다(virtual-fs의 `ReplayError`). 예를 들어 지우라고 기록된 파일이 원본에 없을 때입니다.
- 파일 출처가 목록이나 파일을 읽지 못했습니다(ZIP Worker의 CRC 오류 등).

**다시 시도하지 않습니다.** 실패한 뒤 `<CodeEditor>`는 "에디터를 불러오는 중이에요"에 머뭅니다. 앱에서 "다시 시도"와 "버리기" 버튼을 보여 주세요.

- **다시 시도**: `key`를 바꿔 `<CodeEditor>`를 같은 스냅샷으로 다시 붙입니다.
- **버리기**: 저장본을 지우고, `key`를 바꿔 `initialSnapshot` 없이 다시 붙입니다. 저장본은 사용자가 이것을 골랐을 때만 지우세요.

## 편집 잠금

같은 ZIP을 브라우저 탭 두 곳에서 동시에 고치면 서로의 저장을 덮어씁니다. 이 프로젝트는 편집 권한을 탭 하나에만 줍니다(ADR-0024). 권한을 잃은 브라우저 탭에서는 `controller.setReadOnly(true)`를 부르세요.

- 모든 에디터가 읽기 전용이 됩니다. undo·redo 단축키(Ctrl/Cmd+Z 등)도 아무것도 하지 않습니다.
- 트리의 새로 만들기·이름 바꾸기·삭제·되돌리기가 막힙니다. 도구 모음 버튼이 꺼지고, 오른쪽 클릭 메뉴가 열리지 않고, F2·Delete 키를 눌러도 반응하지 않습니다. 입력 중이던 이름 입력칸은 닫힙니다.
- 잠금 전에 띄운 확인창에서 확인을 눌러도 삭제나 되돌리기를 하지 않습니다.
- 파일을 열어 보는 것은 그대로 됩니다.

권한을 되찾으면 `setReadOnly(false)`로 풉니다. 누가 권한을 가질지 정하는 일(Web Locks 등)은 앱이 합니다.

## 테마와 문구

### 테마

`theme` prop으로 `'light'`나 `'dark'`를 넘깁니다. 기본은 `'light'`입니다. 운영 체제의 밝기 설정을 따르게 하려면, 앱이 `prefers-color-scheme`을 읽어 `'light'`나 `'dark'`로 바꿔 넘깁니다.

`theme`이 정하는 것은 **Monaco의 기본 테마**(`vs` 또는 `vs-dark`)뿐입니다. 기본 테마는 구문 강조 글자색처럼 아래 변수로 정하지 않는 색을 정합니다. 트리·탭·에디터 바탕 같은 나머지 색은 모두 `--cf-*` CSS 변수에서 옵니다.

이 패키지의 CSS에는 **라이트 색만** 들어 있습니다. 그래서 `theme="dark"`만 넘기면 트리와 탭은 밝은 그대로이고, Monaco도 밝은 바탕에 어두운 테마용 글자색이 됩니다. 다크 색은 앱이 줍니다. 방법은 둘 가운데 하나입니다.

- shadcn/ui 변수(`--background` 등)를 쓰는 앱이면, 다크 값을 담은 `.dark` 클래스를 `<html>`에 붙입니다. `--cf-*` 변수는 `<html>`(`:root`)에서 shadcn 변수를 읽으므로, 더 안쪽 요소에 붙인 `.dark`는 따라가지 않습니다.
- 그 밖에는 `--cf-*` 변수를 직접 덮어씁니다.

에디터를 감싼 요소에서 변수를 덮어쓰면, 페이지의 나머지는 그대로 두고 에디터 색만 바꿀 수 있습니다.

```css
.my-editor {
  --cf-background: oklch(0.2 0 0);
  --cf-foreground: oklch(0.95 0 0);
}
```

| 변수 | 쓰는 곳 |
|---|---|
| `--cf-background`, `--cf-foreground` | 바탕과 글자 |
| `--cf-muted`, `--cf-muted-foreground` | 안내 줄, 흐린 글자, 줄 번호 |
| `--cf-accent`, `--cf-accent-foreground` | 오른쪽 클릭 메뉴에서 고른 항목, 탭 닫기 버튼에 마우스를 올렸을 때의 바탕, Monaco의 현재 줄. 트리에서 선택된 줄의 글자(`--cf-accent-foreground`) |
| `--cf-selected` | 트리에서 선택된 줄(활성 탭의 파일)의 바탕 |
| `--cf-border`, `--cf-ring` | 테두리(`--cf-border`). 포커스 테두리, 활성 탭 위쪽 선, 그룹 크기 조절 막대(`--cf-ring`) |
| `--cf-primary`, `--cf-primary-foreground` | 버튼, 커서 |
| `--cf-destructive` | 삭제 버튼 |
| `--cf-popover`, `--cf-popover-foreground` | 메뉴, 확인창 |
| `--cf-modified` | 수정 표시 |
| `--cf-radius` | 모서리 둥글기 |

`--cf-selected`의 기본값은 `:root`에서 `--cf-foreground`에 투명색을 섞어 계산한 값입니다(`color-mix(in oklch, var(--cf-foreground) 9%, transparent)`). CSS 변수는 선언한 요소에서 값을 계산한 뒤 자식에게 물려줍니다. 그래서 감싼 요소에서 `--cf-foreground`만 바꾸면 `--cf-selected`는 `:root`의 글자색으로 계산한 값에 머뭅니다. 위 예시처럼 감싼 요소에서 다크 색을 줄 때는 `--cf-selected`도 함께 덮어쓰세요. `<html>`에 `.dark`를 붙이는 방식에서는 `:root`에서 다시 계산되므로 따로 할 일이 없습니다.

Monaco는 CSS 변수를 읽지 못합니다. 그래서 이 변수들을 `#rrggbb` 색으로 바꿔 Monaco 테마(`codefold-light`, `codefold-dark`)를 만듭니다. 변수에 `oklch()` 같은 값을 써도 바꿀 수 있습니다. dockview의 색도 같은 변수를 따릅니다.

Monaco 테마는 다음 때 다시 만듭니다.

- 작업 공간을 새로 만들었을 때
- `theme`이 바뀌었을 때
- `<html>`이나 `<body>`의 `class`, `style`, `data-theme` 속성이 바뀌었을 때

그래서 앱이 `theme`을 바꾼 뒤 자기 effect에서 `<html>`의 `.dark`를 바꿔도, Monaco 색이 새 변수를 따라갑니다.

### 문구

화면 문구의 기본값은 한국어입니다. 바꿀 문구만 `messages`로 넘기면 나머지는 기본값을 씁니다.

```tsx
<CodeEditor messages={{ newFile: 'New file', retry: 'Try again' }} … />
```

문구는 47개이고, 전체 목록과 기본값은 `defaultMessages`에 있습니다. `{name}` 같은 자리 표시자가 든 문구는 그 이름을 그대로 두세요(예: `closeTab: '{name} 닫기'`).

## 좁은 화면

화면이 좁으면 트리를 옆에 붙여 두기 어렵습니다. `treeMode="overlay"`로 넘기면 트리가 에디터 위에 겹쳐 열립니다.

```tsx
const narrow = useMediaQuery('(max-width: 1023px)');
const [treeOpen, setTreeOpen] = useState(false);

<CodeEditor
  treeMode={narrow ? 'overlay' : 'docked'}
  treeOpen={treeOpen}
  onTreeOpenChange={setTreeOpen}   // 파일을 고르면 false로 부른다
  …
/>
```

- `overlay`에서 트리를 열고 닫는 버튼은 앱이 그립니다.
- 트리가 열린 동안 파일을 열라는 요청이 오면 `onTreeOpenChange(false)`를 불러 트리를 닫게 합니다. 트리에서 파일을 고를 때, 새 파일을 만들어 탭이 열릴 때, 제어 API의 `openFile`을 부를 때가 그렇습니다. 이미 열린 파일을 다시 골라도 부릅니다. 폴더를 누를 때나 에디터 영역에서 탭을 바꿀 때는 부르지 않습니다.
- 트리를 연 것만으로는 `onTreeOpenChange(false)`를 부르지 않습니다. 활성 탭이 이미 있어도 그렇습니다.
- `docked`(기본)에서는 트리가 늘 보이고 `treeOpen`은 쓰지 않습니다.
- 어느 폭에서 바꿀지는 앱이 정합니다. 이 프로젝트는 1024px을 기준으로 씁니다.

`treeMode`와 상관없이, 에디터 영역도 폭에 따라 두 가지를 스스로 바꿉니다.

- **미니맵**: 그룹 에디터의 폭이 600px보다 좁으면 미니맵(오른쪽의 코드 축소 그림)을 끄고, 다시 넓어지면 켭니다. 좁은 에디터에서 미니맵 때문에 글자 영역이 더 줄지 않게 하려는 것입니다. `editorOptions`에 `minimap: { enabled: true }`를 줘도 좁을 때는 끕니다. 늘 끄려면 `minimap: { enabled: false }`를 주세요. 이때는 폭이 바뀌어도 미니맵을 다시 켜지 않습니다.
- **나누기 버튼**: 에디터 영역 전체의 폭이 480px보다 좁으면 "오른쪽으로 나누기" 버튼을 감춥니다([나누기](#나누기)).

## 조각으로 쓰기

화면 배치를 직접 짜고 싶으면 `<CodeEditor>` 대신 조각을 조립합니다. 이때는 쓰는 쪽이 Monaco를 직접 불러와 넘기고, Monaco worker 설정(전역 `self.MonacoEnvironment`)도 직접 합니다. `<CodeEditor>`는 `createWorker`로 이 설정을 대신해 주지만, 조각은 해 주지 않습니다.

```tsx
import * as monaco from 'monaco-editor';
import { createWorkerEnvironment } from '@codefold/monaco-binding';
import { createEditorWorkspace, EditorArea, FileTreePanel, resolveMessages } from '@codefold/react-code-editor';

self.MonacoEnvironment ??= createWorkerEnvironment(makeWorker);
const workspace = await createEditorWorkspace({ source, monaco, initialSnapshot: saved });
const messages = resolveMessages();

<div style={{ display: 'flex', height: '100dvh' }}>
  <aside style={{ width: 256, flexShrink: 0 }}>
    <FileTreePanel workspace={workspace} messages={messages} />
  </aside>
  <main style={{ flex: 1, minWidth: 0 }}>
    <EditorArea
      workspace={workspace}
      monaco={monaco}
      messages={messages}
      initialLayout={saved?.layout ?? undefined}   // 배치 복원
      onReady={(area) => area.onLayoutChange(scheduleSave)}
    />
  </main>
</div>

// 다 쓰면 EditorArea를 화면에서 먼저 떼고 나서
workspace.dispose();
```

`FileTreePanel`과 `EditorArea`는 둘러싼 요소를 꽉 채웁니다(너비·높이 100%). 너비는 위처럼 감싼 요소로 정하세요. `FileTreePanel`의 `className`으로 너비를 주려면 쓰는 쪽의 CSS 클래스를 써야 합니다. 이 패키지의 클래스(`cf:` 접두어)는 쓰는 쪽이 가져다 쓰라고 만든 것이 아닙니다.

| 조각 | 하는 일 |
|---|---|
| `createEditorWorkspace({ source, monaco, initialSnapshot? })` | 작업 공간을 만듭니다. virtual-fs, 등록부, 추적기, 화면 상태 저장소를 묶고, 트리 조작·파일 읽기·내보내기·스냅샷을 줍니다. |
| `FileTreePanel` | 도구 모음, 오른쪽 클릭 메뉴, 이름 입력칸, 확인창을 갖춘 트리입니다. |
| `FileTree` | 줄 목록과 키보드 이동만 있는 트리입니다. 메뉴와 입력칸은 `onRequestRename`, `onRequestDelete`, `renderNameInput`으로 쓰는 쪽이 붙입니다. |
| `EditorArea` | dockview 에디터 영역입니다. 준비되면 작업 공간에 자동으로 연결됩니다. |

조각으로 쓸 때 알아 둘 점은 다음과 같습니다.

- `<CodeEditor>`가 하는 Monaco 설정(worker, TypeScript 언어 서비스 옵션, 테마)은 조각에 없습니다. 필요하면 쓰는 쪽이 설정하세요. 에디터 옵션(단어 자동 완성, 스크린 리더 감지 등)은 `EditorArea`가 그대로 씁니다.
- 제어 API(`CodeEditorController`)는 조각에 없습니다. 작업 공간의 멤버를 직접 씁니다. 다만 [`EditorWorkspace`](#editorworkspace)에 적은 차이(편집 잠금, 배치)가 있습니다.
- `createEditorWorkspace`가 돌려준 작업 공간은 `dispose()`로 정리하세요. 모든 model을 지우고 구독을 끊습니다.
- 작업 공간에는 헤드리스 부품(`fs`, `registry`, `tracker`)이 그대로 드러나 있습니다. 조작은 이 부품을 직접 부르지 말고 `createEntry`, `deleteEntry`, `renameEntry`, `revertFile`을 쓰세요. 부품을 직접 부르면 model·탭·추적기가 어긋납니다.
- 화면 상태 저장소(`store`)는 작업 공간마다 따로 만든 Zustand 저장소입니다. 한 페이지에 작업 공간이 둘이어도 섞이지 않습니다.

## 오류

이 패키지가 던지는 오류는 모두 `CodeEditorError`를 상속합니다.

| 오류 | 언제 나오나 | 담긴 값 |
|---|---|---|
| `NotTextFileError` | 이미지나 바이너리 파일을 `readText`로 읽으려 했습니다. | `path` |
| `FileChangedError` | 파일을 읽는 동안 그 파일의 이름이 바뀌었거나, 지워졌거나, 작업 공간이 닫혔습니다. 그 읽기 결과는 버립니다. | `path` |
| `CodeEditorError` | 다운로드 계획을 만드는 동안 트리가 세 번 연달아 바뀌었습니다. | |

그 밖의 오류는 감싸지 않고 그대로 전달합니다.

- 작업 공간을 만들다 난 오류는 그대로 `onError`로 옵니다. 트리 변경을 다시 적용하지 못한 virtual-fs의 `ReplayError`, 파일 출처가 목록이나 복원할 파일을 읽다 던진 오류, Monaco를 불러오지 못한 오류가 그렇습니다.
- 작업 공간을 만든 뒤 파일 출처(ZIP Worker)가 던진 오류는 그 파일 탭의 "다시 시도" 화면으로 나타납니다.
- 트리 조작의 이름 오류(`InvalidNameError` 등)는 입력칸이 미리 막으므로, `FileTreePanel`을 쓰면 보통 만날 일이 없습니다.

## 쓰는 쪽이 꼭 처리해야 할 것

이 패키지는 편집 화면까지만 다룹니다. 아래 일곱 가지는 쓰는 쪽이 맡아야 합니다.

### 1. 준비물을 갖춥니다

`react`·`react-dom`(19 이상)과 `monaco-editor`(0.56 이상)를 설치하고, `styles.css`를 한 번 불러오고, `createWorker` 함수를 넘기세요.

### 2. 부모 요소에 높이를 줍니다

`<CodeEditor>`를 담는 요소에 정해진 높이가 없으면 트리 가상화와 에디터 영역이 제대로 그려지지 않습니다.

### 3. 새 ZIP은 `source`를 바꿔 엽니다

`source`를 새 객체로 바꾸면 앞 작업 공간을 정리하고 새로 만듭니다. `key`를 바꿔 다시 붙여도 됩니다. 앞 작업 공간을 다 정리한 뒤에 새것을 만들므로, 두 작업 공간의 model이 겹치지 않습니다.

### 4. 다운로드 순서를 지킵니다

`createExportPlan`으로 계획을 만들고, ZIP을 만든 뒤, **성공했을 때만** `markExported(plan)`을 부르세요. 순서가 바뀌면 받지 않은 변경의 개수가 틀립니다.

### 5. 자동 저장을 묶어서 합니다

`onContentChange`·`onTreeChange`·`onLayoutChange`로 저장할 시점을 알고, 알림을 잠시 모았다가 `getSnapshot()`의 결과를 저장하세요. `onContentChange`에서 React 상태를 바꾸지 마세요. `markExported`가 돌려준 다운로드 기록은 다운로드 흐름에서 따로 저장하세요.

### 6. 스냅샷과 ZIP의 짝을 맞추고, 복원 실패를 사용자에게 맡깁니다

스냅샷이 이 ZIP의 것인지는 에디터가 검사하지 않습니다. ZIP과 스냅샷을 함께 저장해 같은 짝으로 넘기세요. `onError`가 오면 "다시 시도"와 "버리기"를 보여 주세요. 둘 다 `key`를 바꿔 `<CodeEditor>`를 다시 붙입니다. 에디터는 자동으로 다시 시도하지 않습니다. 저장본은 사용자가 "버리기"를 골랐을 때만 지우세요.

### 7. 편집 잠금과 이탈 경고는 앱이 정합니다

누가 편집 권한을 가질지 정하고 `setReadOnly`를 부르는 일, `onUnexportedChange`로 이탈 경고(`beforeunload`)를 켜고 끄는 일은 앱이 합니다.

## 상황별 결과

흔히 만나는 상황마다 어떤 결과가 나오는지 모았습니다.

| 상황 | 결과 |
|---|---|
| 트리에서 파일을 두 번 고름 | 새 탭을 만들지 않고 그 탭을 활성화합니다. |
| 같은 이름의 `index.ts` 둘을 엶 | 탭 제목이 `index.ts — src/a`, `index.ts — src/b`가 됩니다. |
| 안 고친 파일의 탭을 닫음 | model이 지워집니다. |
| 고친 파일의 탭을 닫았다가 다시 엶 | 고친 내용과 undo 기록이 그대로입니다. |
| 열린 파일의 이름을 바꿈 | 탭이 같은 자리에서 새 이름으로 바뀝니다. 잠깐 빈 화면이 되고, 다시 여는 데 300ms가 넘게 걸리면 "파일을 여는 중이에요"가 보입니다. undo 기록은 끊기고, 고친 파일은 계속 수정됨 상태입니다. |
| 열린 파일이 든 폴더를 지움 | 그 폴더 안 파일의 탭이 모든 그룹에서 닫힙니다. 고친 파일이 있었으면 먼저 확인창이 뜹니다. |
| 고친 파일을 "변경 되돌리기" | 확인창 뒤 원본 내용으로 돌아가고 수정 표시가 사라집니다. |
| 고친 내용을 직접 지워서 원본과 같아진 파일을 다운로드 | 수정 표시는 남지만, ZIP에는 원본 압축 바이트를 그대로 넣습니다. |
| EUC-KR 파일을 "UTF-8로 바꿔 편집" | 편집할 수 있고 수정됨 상태가 되며, UTF-8로 다운로드됩니다. |
| SVG에서 "코드로 보기" 뒤 고치고 "이미지로 보기" | 고친 내용으로 다시 그립니다. |
| 파일 읽기 실패 | 그 탭에만 "다시 시도"가 보입니다. |
| 페이지를 새로고침(스냅샷 복원) | 트리 변경, 고친 내용, 열린 탭 배치가 돌아옵니다. |
| 맞지 않는 트리 변경이 든 스냅샷으로 복원 | `onError`가 불립니다. |
| 다른 ZIP의 스냅샷으로 복원 | 검사하지 않습니다. 트리에 없는 경로는 버리고, 경로가 같은 파일은 저장된 내용으로 덮습니다. |
| 편집 권한을 잃음(`setReadOnly(true)`) | 편집, undo·redo, 트리 조작이 막히고, 파일 보기는 됩니다. |
| 트리의 빈 곳을 오른쪽 클릭 | 메뉴의 대상이 최상위가 됩니다. 이름 바꾸기와 삭제는 꺼집니다. |
| 좁은 화면(`overlay`)에서 트리를 열고 파일을 고름 | `onTreeOpenChange(false)`가 불립니다. 이미 열린 파일이어도 불립니다. |
| 파일을 만들었다가 바로 지움 | 트리 구조를 바꾼 것이라 `hasChanges()`는 계속 참입니다. |

## API 레퍼런스

### `<CodeEditor>` props

| prop | 필수 | 설명 |
|---|---|---|
| `source` | ✓ | 파일 출처(`FileSource`). 바꾸면 작업 공간을 새로 만듭니다. |
| `createWorker` | ✓ | Monaco worker를 만드는 함수 `(label) => Worker`. 전역 `MonacoEnvironment`가 이미 있으면 쓰지 않습니다. Monaco를 처음 불러올 때의 값만 씁니다. |
| `theme` | | `'light'`(기본) 또는 `'dark'`. Monaco의 기본 테마만 정합니다([테마](#테마)). |
| `messages` | | 바꿀 문구만 담은 객체 |
| `initialSnapshot` | | 복원할 스냅샷. 작업 공간을 만들 때의 값만 씁니다. |
| `onReady` | | 작업 공간과 에디터 영역이 준비되고 배치까지 되살린 뒤, 제어 API를 넘겨 부릅니다. 작업 공간마다 한 번이고, React StrictMode에서도 한 번입니다. |
| `onError` | | 작업 공간을 만들지 못했을 때(Monaco 불러오기 실패, 파일 출처 읽기 실패, 복원 실패). 그 뒤 화면은 불러오는 중 안내에 머뭅니다. |
| `treeMode` | | `'docked'`(기본) 또는 `'overlay'` |
| `treeOpen` | | `overlay`에서 트리가 열려 있는지. 기본 `true` |
| `onTreeOpenChange` | | `overlay`에서 트리가 열린 동안 파일을 열라는 요청(트리에서 고르기, `openFile`)이 오면 `false`로 부릅니다. |
| `editorOptions` | | Monaco 에디터 옵션. 기본 옵션 위에 덮입니다. 그룹의 에디터를 처음 만들 때의 값만 씁니다. 미니맵은 에디터 폭에 따라 켜고 끕니다. 늘 끄려면 `minimap: { enabled: false }`를 주세요([좁은 화면](#좁은-화면)). |
| `className` | | 바깥 요소의 클래스 |

### `CodeEditorController`

`onReady`로 받습니다. 메서드를 떼어 콜백으로 넘겨도 동작합니다. 구독은 모두 `{ dispose() }`를 돌려줍니다.

| 멤버 | 설명 |
|---|---|
| `hasChanges()` | 원본과 달라진 파일이 있거나 트리 구조를 바꿨는지. 다운로드 버튼에 씁니다. |
| `getDirtyPaths()` | 원본과 달라진 파일의 경로 목록 |
| `getUnexportedCount()` | 받지 않은 변경의 개수 |
| `readText(path)` | 파일의 지금 텍스트. model이 있는 파일(열린 파일, 탭을 닫았지만 고친 파일)은 편집 중인 내용, 아니면 원본입니다. 텍스트가 아니면 `NotTextFileError`. |
| `openFile(path)` | 그 파일의 탭을 엽니다. |
| `createExportPlan()` | 다운로드 계획과 새로 쓸 바이트(`ExportRequest`) |
| `markExported(plan)` | 다운로드가 성공했을 때 부릅니다. 다운로드 기록을 돌려줍니다. |
| `getSnapshot()` | 자동 저장용 스냅샷(배치 포함) |
| `getSnapshotFor(paths)` | 넘긴 경로 가운데 고친 파일의 내용만 |
| `setReadOnly(readOnly)` | 편집 잠금을 걸거나 풉니다. |
| `onDirtyChange(listener)` | 파일의 수정 여부가 바뀔 때 `(path, dirty)` |
| `onChangesChange(listener)` | `hasChanges()` 값이 바뀔 때 |
| `onUnexportedChange(listener)` | 받지 않은 변경의 `{ has, count }`가 바뀔 때 |
| `onContentChange(listener)` | 내용이 바뀔 때마다 `(path)`. 입력마다, 그리고 되돌리기·UTF-8 변환 때 옵니다. React 상태로 올리지 마세요. |
| `onTreeChange(listener)` | 트리 조작(추가·삭제·이름 변경)마다 `(change)`. model·탭까지 모두 옮긴 뒤에 부릅니다. 이름 변경은 바꾼 항목 하나의 `from`·`to`만 담습니다. 복원할 때 다시 적용한 변경은 알리지 않습니다. |
| `onLayoutChange(listener)` | 에디터 영역 배치가 바뀔 때 `(layout)`. 탭 열기·닫기·활성화·나누기, 그룹 크기 조절 때 오고, 같은 배치가 거듭 올 수 있습니다. |

`onDirtyChange`·`onChangesChange`·`onUnexportedChange`는 값이 **바뀔 때만** 옵니다. 나머지 셋은 일이 일어날 때마다 옵니다. 구독할 때 지금 값을 한 번 알려 주지는 않으므로, 처음 그릴 값은 `hasChanges()`·`getUnexportedCount()`로 직접 읽으세요.

### `EditorWorkspace`

`createEditorWorkspace`가 돌려주는 작업 공간입니다. `<CodeEditor>` 안에서도 이것을 씁니다. 제어 API의 멤버가 대부분 있고, 조각을 조립할 때 필요한 멤버가 더 있습니다. 제어 API와 다른 점은 다음과 같습니다.

- `setReadOnly`가 없습니다. 편집 잠금은 `store.getState().setReadOnly(readOnly)`로 겁니다.
- `onLayoutChange`가 없고, `getSnapshot()`의 `layout`은 늘 `null`입니다. 배치는 `EditorArea`의 `onReady`로 받은 영역의 `layout()`과 `onLayoutChange`로 직접 다루세요.

| 분류 | 멤버 |
|---|---|
| 부품 | `fs`, `registry`, `tracker`, `store` |
| 영역 | `attachArea(area)`, `openFile`, `onFileOpen(listener)`(파일을 열라는 요청마다 `(path)`. 트리에서 고르기와 `openFile`이 요청이고, 이미 열린 파일이어도 부릅니다), `focusEditor` |
| 파일 | `loadFile(path)` → 텍스트·이미지·바이너리, `textInfo(path)`, `readText(path)`, `loadAsText(path)`(SVG를 코드로), `convertToUtf8(path)`(EUC-KR) |
| 조작 | `createEntry`, `deleteEntry`, `renameEntry`, `revertFile`, `needsDeleteConfirm` |
| 내보내기 | `createExportPlan`, `markExported`, `getSnapshot`, `getSnapshotFor`, `downloadRecord()` |
| 알림 | 제어 API의 구독과 같고, `onFileInfoChange(listener)`(인코딩·읽기 전용 정보가 바뀔 때)가 더 있습니다. |
| 정리 | `dispose()` |

### 컴포넌트

| 컴포넌트 | props |
|---|---|
| `FileTreePanel` | `workspace`, `messages?`(일부만), `className?` |
| `FileTree` | `workspace`, `messages`(전체), `onRequestRename?`, `onRequestDelete?`, `renderNameInput?`, `ref?`, 그 밖의 `div` 속성 |
| `EditorArea` | `workspace`, `monaco`, `messages`(전체), `editorOptions?`, `initialLayout?`, `onReady?(area)`, `className?` |

`messages`가 "전체"인 컴포넌트에는 `resolveMessages(일부)`의 결과를 넘기세요.

### `DockviewArea`

`EditorArea`의 `onReady(area)`로 받는 에디터 영역입니다. 쓰는 쪽이 써도 되는 멤버는 다음과 같습니다.

| 멤버 | 설명 |
|---|---|
| `layout()` | 지금의 배치(dockview JSON) |
| `restoreLayout(layout)` | 저장한 배치를 되살립니다. 지워진 파일의 탭은 빼고, 깨진 JSON이면 빈 영역으로 둡니다. 떠 있던 그룹의 탭은 활성 그룹에 엽니다. |
| `onLayoutChange(listener)` | 배치가 바뀔 때마다 `listener`를 `(layout)`으로 부릅니다. |
| `splitActive()` | 활성 탭을 오른쪽 새 그룹에 하나 더 엽니다. |
| `api` | dockview의 원래 API(`DockviewApi`) |

타입에는 이 밖의 멤버도 있지만 **내부용이니 부르지 마세요.**

- `acquire`, `editorFor`, `takeFocusRequest`, `dispose`는 `EditorArea`가 쓰는 멤버입니다. 특히 `acquire`는 등록부의 탭 수를 직접 올리므로, 부르면 [탭과 model의 수명](#탭과-model의-수명)이 어긋납니다. `dispose`를 따로 부르지 않아도 `EditorArea`를 화면에서 떼면 영역이 정리됩니다.
- `open`, `close`, `rename`, `focusEditor`, `onActiveChange`는 작업 공간이 부르는 멤버입니다. 파일을 열 때는 작업 공간의 `openFile`을 쓰세요.

### 문구 함수

| 함수 | 설명 |
|---|---|
| `defaultMessages` | 한국어 기본 문구 전체 |
| `resolveMessages(partial?)` | 기본 문구 위에 넘긴 문구만 덮은 전체 문구 |
| `formatMessage(template, values)` | `{name}` 같은 자리 표시자를 채웁니다. |

### 타입

이 패키지가 내보내는 타입입니다.

| 타입 | 설명 |
|---|---|
| `CodeEditorProps`, `CodeEditorController` | 완성형 컴포넌트의 props와 제어 API |
| `EditorWorkspace`, `CreateEditorWorkspaceOptions`, `WorkspaceOperations`, `WorkspaceExport` | 작업 공간과 그 부분 |
| `WorkspaceSnapshot`, `DownloadRecord`, `ExportPlan`, `ExportRequest` | 저장·다운로드에 쓰는 순수 데이터 |
| `LoadedFile` | `loadFile`의 결과. `text`, `image`, `binary` 세 종류 |
| `EditorAreaPort`, `EditorAreaProps`, `DockviewArea`, `FilePanelParams` | 에디터 영역 |
| `FileTreeProps`, `FileTreePanelProps`, `NameInputRow` | 트리 |
| `EditorState`, `EditorActions`, `EditorStore`, `EditingState` | 화면 상태 저장소 |
| `CodeEditorMessages`, `ThemeMode` | 문구와 테마 |

## 크기와 성능

빌드 결과의 크기입니다. `react`, `react-dom`, `monaco-editor`는 들어 있지 않습니다. kB는 1,000바이트이고, gzip은 기본 압축 수준으로 쟀습니다.

| 파일 | 크기 | gzip |
|---|---|---|
| `dist/index.js` | 약 77.7kB | 약 24.1kB |
| `dist/styles.css` | 약 139.2kB | 약 12.8kB (대부분 dockview CSS) |

성능을 위해 다음을 지킵니다.

- **Monaco는 에디터가 화면에 붙을 때 불러옵니다.** 첫 화면 번들에 들어가지 않습니다. 빌드할 때마다 검사 스크립트(`scripts/verify-dist.mjs`)가 Monaco를 정적으로 불러오는 코드가 없는지 확인합니다.
- **키를 눌러도 React가 다시 그리지 않습니다.** 파일 내용은 Monaco model에만 있고, React 상태에는 수정 여부 같은 메타데이터만 둡니다. 수정 여부도 바뀔 때만 알립니다.
- **트리는 보이는 줄만 그립니다.** 트리 줄과 탭은 자기 경로의 수정 여부만 구독하므로, 파일 하나를 고쳐도 그 줄만 다시 그립니다.
- **그룹마다 에디터는 하나입니다.** 탭을 바꿀 때 에디터를 새로 만들지 않습니다.
- **이미지 바이트를 오래 붙잡아 두지 않습니다.** 탭이 열려 있는 동안만 들고 있고, 이미지 탭을 열 때마다 다시 읽고, 닫으면 그림 주소를 풉니다.

## 한계

쓰기 전에 아래 한계를 알아 두세요.

- **같은 경로의 파일이 든 `<CodeEditor>` 둘을 한 페이지에 띄울 수 없습니다.** Monaco는 model을 주소(`file:///경로`)로 구분하는데, 이 주소를 페이지 전체가 함께 쓰므로 두 에디터의 주소가 겹칩니다.
- **다크 색은 이 패키지에 없습니다.** `theme="dark"`는 Monaco의 기본 테마만 바꿉니다. 다크 색은 앱이 `--cf-*`나 shadcn 변수로 줍니다.
- **Monaco 색은 정해진 때만 CSS 변수를 다시 읽습니다.** `theme`이 바뀔 때와 `<html>`·`<body>`의 `class`·`style`·`data-theme`이 바뀔 때입니다. 다른 방법으로 변수만 바꾸면(더 안쪽 요소의 클래스, 스타일시트 교체 등) 에디터 영역과 트리는 바뀌지만 Monaco 색은 그대로입니다.
- **Monaco 테마는 페이지에 하나입니다.** 에디터 둘에 서로 다른 테마를 줄 수 없습니다.
- **열린 파일의 이름을 바꾸면 그 탭이 잠깐 빈 화면이 됩니다.** 다시 여는 데 300ms가 넘게 걸리면 "파일을 여는 중이에요"가 보입니다. SVG를 코드로 보던 탭은 이미지 보기로 돌아갑니다.
- **이름을 바꾸면 그 파일의 undo 기록이 끊깁니다.** model을 새 경로로 다시 만들기 때문입니다. 고친 파일은 돌아갈 원본 버전이 없어져, 내용을 원본과 똑같이 고쳐도 수정됨 상태로 남습니다. 수정 표시를 없애려면 "변경 되돌리기"를 쓰세요.
- **다운로드 계획에는 `crypto.subtle`이 필요합니다.** `https`나 `localhost`가 아닌 주소(비보안 주소)에서는 계획을 만들지 못합니다.
- **복원할 때 구조 비교는 경로 목록의 차이로 합니다.** 다운로드한 뒤 이름을 바꾼 파일은, 복원하고 나면 받지 않은 변경 2개(옛 경로, 새 경로)로 세어질 수 있습니다. "있는지"(`has`)는 같습니다.
- **다크 모드에서도 dockview에는 `dockview-theme-light cf-dockview` 클래스를 붙입니다.** `.cf-dockview`에서 dockview의 색 변수(`--dv-*`)를 `--cf-*` 변수에 묶으므로 보이는 색은 맞습니다. 앱이 dockview 색을 따로 덮어쓰려면 `.cf-dockview` 아래에 쓰세요.
- **Shift+F10과 메뉴 키는 트리가 직접 처리하지 않습니다.** 브라우저가 오른쪽 클릭 이벤트를 보내 줄 때만 메뉴가 열립니다. macOS 브라우저는 보통 보내지 않습니다. 열리더라도 메뉴는 줄 옆이 아니라 이벤트 좌표에 뜹니다.
- **쓰는 쪽 페이지에 CSS 초기화(preflight)가 없으면 버튼에 브라우저 기본 스타일이 조금 남을 수 있습니다.**
- **단위 테스트로 확인하지 못한 동작이 있습니다.** 탭 끌기, 실제 키 입력, 크기 조절은 테스트 환경(jsdom)에서 흉내 낼 수 없어, 앱 단계의 브라우저 E2E 테스트(Playwright)에서 확인합니다.

## 테스트

```sh
pnpm --filter @codefold/react-code-editor test
```

가짜가 아니라 **실제 Monaco**를 Vitest와 jsdom에서 실행합니다. 트리 가상화에 필요한 스크롤 영역의 크기(`offsetHeight`, `scrollHeight`, `scrollTo`)만 흉내 냅니다. 테스트는 172개입니다. 작업 공간(파일 읽기, 조작, 내보내기, 복원), 트리(키보드, 메뉴, 입력칸, 확인창, 가상화), 에디터 영역(탭, 나누기, model 수명, 배치 복원), 파일 보기, `<CodeEditor>` 조립(StrictMode, 새 ZIP, 제어 API)을 확인합니다.

빌드(`pnpm --filter @codefold/react-code-editor build`)의 마지막에는 [scripts/verify-dist.mjs](scripts/verify-dist.mjs)가 다음을 확인합니다.

- 코드가 React Compiler를 거쳤는지(`react/compiler-runtime`을 불러오는지)
- Monaco를 정적으로 불러오는 코드가 없는지
- 번들 밖에 두기로 한 의존성만 불러오고, 나머지 라이브러리 코드가 번들에 들어가지 않았는지
- `dist/index.js`가 150,000바이트를 넘지 않는지(넘으면 의존성이 번들에 섞였다고 봅니다)
- CSS 클래스에 `cf` 접두어가 붙었고, 쓰는 쪽 페이지를 초기화하는 규칙(preflight)이 없는지

## 관련 결정 기록

왜 이렇게 설계했는지는 아래 문서에 있습니다.

- [ADR-0006](../../docs/adr/0006-monaco-model-as-content-source.md): 파일 내용은 Monaco model에, React 상태에는 메타데이터만 둔다
- [ADR-0007](../../docs/adr/0007-dockview-editor-area.md): 에디터 영역을 dockview로 그리고, 그룹마다 에디터 하나를 둔다
- [ADR-0009](../../docs/adr/0009-modified-vs-unexported-state.md): 수정 여부와 받지 않은 변경을 따로 관리한다
- [ADR-0012](../../docs/adr/0012-file-tree-operations.md): 트리의 추가·삭제·이름 변경, 옮기기는 없음
- [ADR-0015](../../docs/adr/0015-ui-language-korean.md): 화면 문구는 한국어로 쓰고 한 곳에 모은다
- [ADR-0017](../../docs/adr/0017-factory-interfaces-and-plain-data.md): 팩토리로 만든 객체와 순수 데이터로 주고받는다
- [ADR-0019](../../docs/adr/0019-react-compiler.md): React Compiler로 메모이제이션을 자동화한다
- [ADR-0020](../../docs/adr/0020-cn-with-clsx-tailwind-merge.md): 클래스는 clsx와 tailwind-merge로 합친다
- [ADR-0021](../../docs/adr/0021-monaco-direct-without-wrapper.md): Monaco를 래퍼 없이 직접 쓰고, worker 함수를 쓰는 쪽이 넘긴다
- [ADR-0022](../../docs/adr/0022-react-ui-package.md): 완성형 에디터 UI를 패키지로 내보내고, 앱은 공개 API만 쓴다
- [ADR-0024](../../docs/adr/0024-single-tab-edit-lock.md): 편집 권한은 브라우저 탭 하나에만 준다
- [ADR-0025](../../docs/adr/0025-download-record-content-hash.md): 다운로드 기록을 지문으로 남긴다
- [ADR-0026](../../docs/adr/0026-monaco-language-loading.md): 언어는 전부 등록하고 규칙은 열 때 불러온다
- [ADR-0028](../../docs/adr/0028-zip-work-in-web-worker.md): ZIP 작업은 Web Worker에서 한다. 새로 쓸 바이트 배열마다 버퍼를 따로 두어 Worker로 넘기는 근거입니다.
- [ADR-0029](../../docs/adr/0029-virtualized-file-tree.md): 트리는 보이는 줄만 그린다
- [ADR-0031](../../docs/adr/0031-file-kind-detection-revised.md): 파일 종류를 판단할 때 이미지 확장자보다 내용을 믿는다
- [ADR-0034](../../docs/adr/0034-react-code-editor-vite-library-build.md): Vite 라이브러리 모드로 빌드한다
- [ADR-0035](../../docs/adr/0035-library-dialogs-without-nice-modal.md): 라이브러리 안의 확인창은 nice-modal 없이 띄운다
- [ADR-0042](../../docs/adr/0042-remove-floating-groups.md): 에디터 영역에 떠 있는 그룹을 두지 않는다
