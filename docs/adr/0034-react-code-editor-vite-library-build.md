# ADR-0034. `@codefold/react-code-editor`는 Vite 라이브러리 모드로 빌드한다

- 상태: 승인
- 날짜: 2026-09-27
- 일부 보완: ADR-0019(적용 범위), ADR-0022(CSS 약속을 지키는 방법)

## 배경

다른 패키지는 `tsc`로만 빌드한다. `@codefold/react-code-editor`도 지금은 똑같이 `tsc`로 빌드하는데, 이 패키지에는 `tsc`로 할 수 없는 일이 두 가지 있다.

- **React Compiler(ADR-0019)**: 저장소 안에서는 앱의 Vite가 `source` 조건으로 패키지 소스를 직접 불러와 컴파일러를 적용한다. 하지만 밖에서 `dist/`를 받아 쓰는 서비스는 메모이제이션이 빠진 코드를 받는다. "입력마다 React 렌더 0회"(ADR-0027) 같은 성능 약속이 외부 사용처에서는 지켜지지 않는다.
- **CSS(ADR-0022)**: ADR-0022는 "쓰는 쪽이 Tailwind를 쓰지 않을 수 있으므로 빌드한 CSS 파일을 함께 내보낸다"고 약속했다. `tsc`에는 Tailwind 클래스를 CSS 파일로 뽑는 단계가 없다.

## 선택지

패키지를 어떻게 빌드할지 두 가지를 비교했다.

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 이 패키지만 Vite 라이브러리 모드로 빌드한다 | 외부 사용처도 컴파일러를 거친 코드와 빌드한 CSS를 받는다. 앱과 같은 도구(Vite, React Compiler 프리셋, Tailwind 플러그인)를 쓴다 | 패키지에 Vite 설정 파일이 하나 는다 |
| B. 지금처럼 `tsc`로만 빌드한다 | 다른 패키지와 빌드 방식이 같다 | 외부 사용처가 React Compiler와 Tailwind를 직접 돌려야 한다. ADR-0022의 CSS 약속을 어긴다 |

## 결정

**A를 택한다.**

- **JS**: Vite 라이브러리 모드로 ESM 하나(`dist/index.js`)를 만든다. 앱과 같은 `reactCompilerPreset`을 적용한다. React 19에는 컴파일러 런타임(`react/compiler-runtime`)이 들어 있어 새 의존성이 없다.
- **밖에 두는 의존성**: `react`, `react-dom`, `monaco-editor`(peer)와 `@codefold/*` 헤드리스 패키지, 그 밖의 `dependencies`(dockview 등)는 번들에 넣지 않는다. 그래야 쓰는 쪽의 번들러가 이 의존성들을 한 벌만 둔다.
- **CSS**: Tailwind v4로 `dist/styles.css` 한 파일을 만든다. 쓰는 쪽은 `import '@codefold/react-code-editor/styles.css'` 한 줄을 더한다. 패키지는 CSS를 스스로 import하지 않는다(서버 렌더링과 CSS 순서를 쓰는 쪽이 정하게).
- **충돌 방지**: 이 패키지의 Tailwind 클래스에는 접두어 `cf`를 붙인다(`cf:flex`). 디자인 토큰 CSS 변수도 `--cf-`로 시작한다. 쓰는 쪽이 자기 Tailwind를 써도 클래스와 변수가 겹치지 않고, 쓰는 쪽은 `--cf-` 변수를 덮어써 색·간격을 바꾼다.
- **타입**: 타입 선언은 지금처럼 `tsc`로 만든다(`--emitDeclarationOnly`).
- **저장소 안 개발**: 앱은 지금처럼 `source` 조건으로 소스를 불러온다(ADR-0005). 앱의 Tailwind가 패키지 소스의 `cf:` 클래스도 뽑도록 앱 CSS에 패키지 소스 경로를 `@source`로 추가한다.

## 근거

- 성능 약속과 CSS 약속은 저장소 밖에서 쓸 때에도 지켜져야 "다른 서비스에 붙일 수 있는 에디터"라고 말할 수 있다(ADR-0022).
- 앱과 같은 도구를 쓰므로 새로 배울 것이 없고, 설정 하나로 끝난다.

## 결과

- 패키지에 `vite.config.ts`가 생기고 `build` 스크립트가 `vite build && tsc -p tsconfig.build.json --emitDeclarationOnly`가 된다.
- `package.json`의 `exports`에 `./styles.css`를 더한다.
- 빌드한 `dist/index.js`에 `react/compiler-runtime` import가 있는지, `react`·`monaco-editor`·`@codefold/*`가 번들에 들어가지 않았는지 빌드 확인 단계에서 검사한다.
- 패키지 README에 CSS import 한 줄과 `--cf-` 변수 목록을 적는다.
