# ADR-0018. TypeScript 6.0과 ESLint 9를 쓴다

- 상태: 승인
- 날짜: 2026-09-27

## 배경

환경을 구성한 2026-09-27 기준 최신 버전은 TypeScript 7.0.2, ESLint 10.11.0이다. 두 도구는 다른 도구와 맞물려 동작하므로, 최신 버전을 쓰려면 함께 쓰는 도구가 그 버전을 지원해야 한다.

- **TypeScript 7**은 컴파일러를 Go로 다시 작성한 버전이다. 린트 도구 `typescript-eslint`(8.70.1)는 TypeScript 컴파일러의 JavaScript API로 타입 정보를 읽는다. 지원 범위는 `typescript >=4.8.4 <6.1.0`이라 TypeScript 7이 빠진다.
- **ESLint 10**은 이 프로젝트가 켜 두는 접근성 린트 `eslint-plugin-jsx-a11y`(6.10.2)의 지원 범위(`eslint ^3 … ^9`) 밖이다. 클릭 핸들러가 달린 `<div>`처럼 키보드로 쓸 수 없는 요소를 작성 시점에 막는 규칙이다.

## 선택지

최신 버전을 쓸지, 호환되는 버전으로 맞출지 세 가지를 비교했다.

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. TypeScript 7 + ESLint 10 | 가장 새롭다. TypeScript 7은 타입 검사가 크게 빠르다 | 타입 기반 린트와 접근성 린트가 동작하지 않는다 |
| B. 타입 검사는 TypeScript 7, 린트는 TypeScript 6로 두 벌 운영 | 타입 검사 속도를 얻는다 | 같은 코드를 두 컴파일러가 다르게 해석할 수 있고, 설정이 복잡해진다. 이 규모에서는 속도 이득이 작다 |
| C. TypeScript 6.0 + ESLint 9 | 모든 도구가 공식 지원 범위 안에서 동작한다 | 최신 버전이 아니다. ESLint 9에는 deprecated 표시가 붙어 있다 |

## 결정

**C를 택한다.** TypeScript 6.0.3, ESLint 9.39.5를 쓴다.

- 버전은 `pnpm-workspace.yaml`의 catalog 한 곳에 적고, 각 패키지는 `catalog:`로 가져다 쓴다. 버전을 올릴 때 한 줄만 고치면 된다.
- TypeScript 6.0에서 폐기 예정인 `baseUrl`은 쓰지 않고, `paths`만 쓴다.
- Vite 8, Vitest 5, React 19.3, Tailwind 4.3, Playwright 1.63은 최신 버전을 쓴다. 호환 문제가 없다.

## 결과

- `typescript-eslint`가 TypeScript 7을, `eslint-plugin-jsx-a11y`가 ESLint 10을 지원하면 catalog의 버전만 올려 옮겨 간다.
- ESLint 9의 deprecated 표시는 위 호환 문제 때문에 감수한다.
