# ADR-0021. Monaco는 React 래퍼 없이 `monaco-editor`를 직접 쓴다

- 상태: 승인 (언어 목록은 ADR-0026에서 보완. 패키지 구성은 ADR-0016·0022·0023으로 일부 대체: `packages/editor`가 `monaco-binding`과 `react-code-editor`로 나뉘고, Monaco는 `react-code-editor`가 불러온다)
- 날짜: 2026-09-27

## 배경

React에서 Monaco를 쓸 때는 흔히 `@monaco-editor/react` 같은 서드파티 래퍼를 쓴다. 이 프로젝트는 래퍼 없이 `monaco-editor`를 직접 쓴다. 이 ADR은 래퍼가 이 앱에 맞지 않는 이유와 직접 쓸 때 우리가 떠안는 일을 정리한다.

## 래퍼가 이 설계와 맞지 않는 이유

`@monaco-editor/react`는 편하지만, 이 앱의 설계와 부딪히는 기본 동작이 있다.

| 래퍼의 기본 동작 | 이 앱에서 문제가 되는 이유 |
|---|---|
| 내부 로더(`@monaco-editor/loader`)가 기본값으로 Monaco를 CDN(jsDelivr)에서 내려받는다 | 앱과 Monaco의 버전이 따로 놀고, CDN이 막힌 환경이나 오프라인에서는 에디터가 뜨지 않는다 |
| 컴포넌트 하나가 에디터 하나와 model을 함께 관리한다 | ADR-0006·0007의 "파일마다 model 하나, 그룹마다 에디터 하나, 탭 전환은 `setModel`" 구조를 래퍼 바깥에서 다시 짜야 한다 |
| `value`/`onChange`로 값을 주고받는 제어 컴포넌트로 쓰게 이끈다 | 입력마다 문자열이 React 상태로 올라가는 구조가 되기 쉽다. ADR-0006이 피하려는 구조다 |
| React에 묶여 있다 | ADR-0016에서 `editor` 패키지를 React 없이 쓸 수 있게 하기로 했다 |

CDN 로딩은 번들 최적화도 막는다. 번들러가 Monaco를 보지 못하므로 필요한 언어만 넣는 식으로 크기를 줄일 수 없다. 로더 설정으로 로컬 번들을 쓰게 바꿀 수는 있지만, 그러면 worker 설정처럼 직접 쓸 때 해야 하는 일을 똑같이 해야 해서 래퍼를 쓰는 이점이 줄어든다.

## 결정

`packages/editor`가 `monaco-editor` ESM 빌드를 직접 다룬다.

직접 쓰면서 우리가 맡는 일은 다음과 같다.

- **Worker 설정**: Monaco의 언어 서비스(TypeScript, JSON, CSS, HTML)와 에디터 기본 worker는 별도 스레드에서 돈다. 래퍼는 이를 CDN으로 해결하지만, 직접 쓰면 번들러가 worker 파일을 만들도록 설정해야 한다. Vite에서는 `?worker` import로 worker를 만들고 `self.MonacoEnvironment.getWorker`에 연결한다.
- **Worker 연결 주입**: `MonacoEnvironment` 설정은 번들러마다 다르다. 그래서 `packages/editor`는 이 전역 설정을 스스로 하지 않고, 쓰는 쪽(앱)이 worker를 만드는 함수를 넘기게 한다. 다른 번들러(webpack 등)를 쓰는 서비스도 같은 패키지를 쓸 수 있다.
- **번들 크기**: `monaco-editor` 전체를 import하지 않고 에디터 API와 필요한 언어만 import한다. 에디터 코드는 ZIP을 올린 뒤에 동적 import로 불러와 첫 화면 번들에서 뺀다.
- **수명 관리**: 에디터와 model의 생성·`dispose()`를 직접 짝짓는다. React StrictMode가 컴포넌트를 두 번 마운트해도 인스턴스가 하나만 남도록, effect 정리 함수에서 해제한다(ADR-0006).
- **단축키**: undo는 Ctrl/Cmd+Z, redo는 Ctrl/Cmd+Shift+Z로 명시적으로 등록한다. Monaco의 기본 redo 단축키는 운영체제마다 다르기 때문이다.

## 결과

- Monaco 버전은 앱의 `package.json`이 정하고, CDN 없이 동작한다.
- 필요한 언어만 번들에 넣어 크기를 조절할 수 있다. 측정값은 README에 남긴다.
- worker 설정, 수명 관리, 단축키는 우리가 직접 맡으므로 테스트로 지킨다.
