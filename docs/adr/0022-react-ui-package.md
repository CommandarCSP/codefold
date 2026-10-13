# ADR-0022. 완성형 에디터 UI를 `@zip-editor/react` 패키지로 내보내고, 앱은 그 첫 번째 사용처가 된다

- 상태: 승인 (패키지 이름은 ADR-0023으로 일부 대체)
- 날짜: 2026-09-27
- 일부 대체: ADR-0016의 의존 규칙("패키지끼리는 서로 import하지 않는다")

## 배경

여기서 만든 코드 에디터는 다른 서비스에서도 쓸 수 있어야 한다(ADR-0003).

ADR-0016까지의 설계로 Monaco binding(`@zip-editor/editor`)은 React 없이 재사용할 수 있다. 하지만 파일 트리, 탭과 도킹, 에디터 화면을 묶은 **완성형 코드 에디터 UI**는 `apps/web` 안에 있다. 그래서 다른 서비스가 가져다 쓸 수 없다. 같은 에디터를 여러 서비스(코딩 실습, 시험, 코드 리뷰 등)에 붙이려면 이 UI를 패키지로 내보내야 한다.

## 선택지

재사용 범위를 어디까지로 할지 세 가지를 비교했다.

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 완성형 에디터 UI를 `@zip-editor/react` 패키지로 분리한다 | 다른 서비스가 컴포넌트 하나로 에디터를 붙인다. 앱이 같은 API를 쓰므로 API가 실제로 쓸 만한지 늘 검증된다 | 패키지가 하나 늘고, 라이브러리 배포에 필요한 일(CSS, peer dependency, SSR 안전성)이 생긴다 |
| B. 헤드리스 패키지만 제공한다 | 작업량이 그대로다 | 다른 서비스는 UI를 새로 짜야 한다 |
| C. `apps/web` 전체를 라이브러리로 만든다 | 분리 작업이 없다 | 업로드·자동 저장 같은 제품 전용 기능이 섞여 재사용하기 어렵다 |

## 결정

**A를 택한다.**

### 세 층 구조

| 층 | 패키지 | 책임 |
|---|---|---|
| 헤드리스 | `zip`, `file-kind`, `workspace`, `editor` | React 없는 순수 로직과 Monaco binding |
| React UI | `react` | 헤드리스 패키지를 조립한 완성형 에디터(`<CodeEditor>`)와 조각 컴포넌트, 훅 |
| 제품 앱 | `apps/web` | ZIP 업로드·다운로드, 자동 저장(ADR-0014), 페이지 구성. `@zip-editor/react`의 첫 번째 사용처 |

`apps/web`은 다른 서비스와 같은 공개 API로 `<CodeEditor>`를 쓴다. 내부 모듈을 직접 import하지 않는다.

### 의존 규칙 (ADR-0016 대체)

패키지 사이에 허용하는 import 방향은 다음과 같다.

```
apps/web  → react, zip, (필요하면) workspace·editor·file-kind의 공개 API
react     → workspace, editor, file-kind
workspace → (없음)
zip       → (없음)
editor    → monaco-editor (peer)
file-kind → (없음)
```

- 헤드리스 패키지끼리는 서로 import하지 않는다.
- 헤드리스 패키지를 조립할 수 있는 패키지는 `react`뿐이다.
- `react`는 `zip`을 import하지 않는다. 파일 출처는 `FileSource`로 받는다(ADR-0016). ZIP을 여는 일은 `apps/web`이 한다.
- 규칙은 ESLint import 제한으로 강제한다.

### 라이브러리로 내보내기 위한 약속

- **peer dependency**: `react`, `react-dom`, `monaco-editor`는 쓰는 쪽이 설치한다. 번들에 두 벌 들어가지 않게 한다.
- **CSS**: 쓰는 쪽이 Tailwind를 쓰지 않을 수 있으므로, 빌드한 CSS 파일을 함께 내보낸다. 색·간격은 CSS 변수로 두어 쓰는 쪽이 덮어쓸 수 있게 한다.
- **Worker**: `monaco-editor` worker를 만드는 함수는 쓰는 쪽이 넘긴다(ADR-0021).
- **문구**: 화면 문구는 prop으로 주입하고, 기본값으로 한국어 문구를 둔다(ADR-0015).
- **SSR 안전성**: Monaco는 `window`가 필요하므로 에디터 코드는 브라우저에서만 동적 import한다. 서버 렌더링 환경에서 패키지를 import해도 깨지지 않게 한다.
- **제품 기능과의 연결**: 다운로드와 자동 저장은 앱의 일이다. `<CodeEditor>`는 수정된 파일 내용 읽기, 수정 상태 구독처럼 앱이 이 기능을 만들 때 필요한 제어 API를 공개한다. 구체적인 모양은 설계 문서에서 정한다.

### 앱 아키텍처 규칙과의 관계

앱 5계층 규칙은 앱 구조를 기준으로 한다. 적용 범위를 다음과 같이 나눈다.

- `apps/web`: 5계층 전부(Page, Domain Component, Business Hook, Store, Utils)를 따른다.
- `packages/react`: 라이브러리에는 페이지와 라우팅이 없으므로 Page 계층을 두지 않는다. View Component(props만으로 그리는 UI)와 Business Hook(헤드리스 패키지를 ViewModel로 가공) 규칙을 따른다. 코드 리뷰에서 확인한다.

## 결과

- "에디터를 다른 서비스에 붙이려면?"이라는 질문에 "`@zip-editor/react`를 설치하고 `<CodeEditor>`에 `FileSource`를 넘긴다"고 답할 수 있다.
- 앱이 라이브러리의 첫 번째 사용자이므로 공개 API가 부족하면 앱을 만들면서 바로 드러난다.
- 개발 순서가 바뀐다. `packages/react`는 헤드리스 패키지 다음에 구현하고, 그 뒤에 `apps/web`의 제품 기능(업로드·다운로드·자동 저장·페이지)을 만든다.
