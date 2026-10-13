# ADR-0023. 패키지 scope를 `@codefold`로 하고, 이름에 역할이 드러나게 짓는다

- 상태: 승인
- 날짜: 2026-09-27
- 일부 대체: ADR-0003·0010·0016·0022의 패키지 이름, ADR-0011의 커밋 범위 이름

## 배경

ADR-0022에서 패키지를 다른 서비스에서도 쓸 라이브러리로 내보내기로 했다. 그런데 처음 붙인 이름은 이 저장소 안에서만 통하는 이름이었다. 밖에서 처음 보는 사람에게는 아래 세 이름이 헷갈린다.

- scope가 `@zip-editor`라서 ZIP과 상관없는 패키지에도 "ZIP 에디터"라는 이름이 붙는다. ZIP을 쓰지 않는 서비스도 `@zip-editor/react`를 설치해야 한다.
- `editor`는 Monaco 연결 코드이고 완성형 코드 에디터는 `react`인데, 이름만으로는 거꾸로 읽힌다.
- `workspace`는 pnpm workspace와 이름이 겹친다.

패키지가 아직 빈 틀이라 지금 바꾸면 비용이 거의 없다.

## 결정

scope는 `@codefold`로 한다. 코드 접기(folding)와 폴더(folder)를 함께 떠올리게 하는 한 단어로, 특정 파일 형식에 묶이지 않는다. 패키지 이름은 npm에서 처음 보는 사람도 역할을 알 수 있게 짓는다.

| 역할 | 옛 이름 | 새 이름 | 폴더 |
|---|---|---|---|
| ZIP 읽기·쓰기 | `@zip-editor/zip` | `@codefold/zip-archive` | `packages/zip-archive` |
| 파일 종류 판단 | `@zip-editor/file-kind` | `@codefold/file-type-detector` | `packages/file-type-detector` |
| 가상 파일 시스템 | `@zip-editor/workspace` | `@codefold/virtual-fs` | `packages/virtual-fs` |
| Monaco 연결 | `@zip-editor/editor` | `@codefold/monaco-binding` | `packages/monaco-binding` |
| 완성형 코드 에디터 UI | `@zip-editor/react` | `@codefold/react-code-editor` | `packages/react-code-editor` |
| 제품 앱 (npm에 올리지 않음) | `@zip-editor/web` | `@codefold/zip-editor` | `apps/zip-editor` |

이름을 이렇게 지은 이유는 다음과 같다.

- `zip-archive`: "zip"만으로는 압축 도구인지 ZIP 파일 형식인지 모호하다.
- `file-type-detector`: 파일 종류를 판별한다는 동작이 이름에 드러난다.
- `virtual-fs`: 약어 `vfs`를 모르는 사람도 읽을 수 있고, pnpm workspace와 겹치지 않는다.
- `monaco-binding`: Monaco 자체가 아니라 Monaco와 앱을 잇는 연결 코드임이 드러난다.
- `react-code-editor`: React 컴포넌트임이 이름에 드러난다. 다른 프레임워크를 쓰는 서비스가 잘못 설치할 일이 없다.
- "ZIP 에디터"라는 이름은 제품 앱에만 남긴다.

### 앞선 ADR 읽는 법

확정한 ADR을 고치지 않는다는 규칙에 따라, ADR-0003·0010·0016·0022 등의 본문은 옛 이름을 그대로 둔다. 위 대응표로 옮겨 읽는다. 커밋 범위(ADR-0011)에도 새 패키지 이름을 쓴다. 범위 목록은 README의 "범위" 표가 기준이다.

## 결과

- 설치 명령만 보고도 무엇을 받는지 알 수 있다(예: `pnpm add @codefold/react-code-editor`).
- ESLint 경계 규칙, dt 설정의 소스 경로(`apps/zip-editor/src`), CI 필터를 새 이름으로 바꾼다.
- 실제로 npm에 배포할 때는 `@codefold` scope를 등록할 수 있는지 확인해야 한다. 등록할 수 없으면 scope만 바꾸고 패키지 이름은 그대로 둔다.
