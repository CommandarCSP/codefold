# ADR-0030. 지원 브라우저는 Chrome·Edge·Firefox·Safari의 최신 두 버전이다

- 상태: 승인
- 날짜: 2026-09-27

## 배경

이 앱은 폴리필 없이 브라우저 내장 기능에 기대는 부분이 많다. 주요 기능은 다음과 같다.

| 기능 | 쓰는 곳 | 근거 ADR |
|---|---|---|
| `DecompressionStream`·`CompressionStream`(`deflate-raw`) | ZIP 압축 해제와 재압축 | ADR-0001 |
| Web Locks API | 한 탭만 편집 | ADR-0024 |
| `crypto.subtle.digest` | 다운로드 기록의 내용 지문 | ADR-0025 |
| IndexedDB, `navigator.storage.persist()` | 작업 상태 자동 저장 | ADR-0014 |
| Web Worker, `Blob.slice()` | ZIP 작업 | ADR-0028 |

이 밖에 `TextDecoder`(파일 이름·내용 디코딩), `requestIdleCallback`(자동 저장, Safari에서는 대체 경로) 등도 쓴다.

지원 범위가 있어야 어떤 기능을 폴리필 없이 쓸지, E2E를 어느 브라우저에서 돌릴지 결정할 수 있다.

## 선택지

지원 범위를 두고 두 가지를 비교했다.

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 주요 브라우저 네 개의 최신 두 버전 | 위 기능을 모두 폴리필 없이 쓸 수 있다. 번들이 작다 | 오래된 브라우저에서는 동작하지 않는다 |
| B. 더 오래된 버전까지 지원 | 쓸 수 있는 사용자가 늘어난다 | `deflate-raw` 스트림 등을 대신할 라이브러리와 폴리필이 필요해 ADR-0001의 "ZIP 라이브러리 없음"과 번들 목표가 흔들린다 |

## 결정

**A를 택한다.** Chrome, Edge, Firefox, Safari의 최신 두 버전을 지원한다.

### 보증하는 범위와 여는 기준

- **보증하는 범위**는 위 네 브라우저의 최신 두 버전이다. E2E는 Chromium, Firefox, WebKit 세 엔진에서 돌린다(ADR-0013). Edge는 Chromium 엔진이라 따로 돌리지 않는다.
- **앱을 여는 기준**은 버전이 아니라 기능 감지다. 앱을 열 때 위 기능을 지원하는지 확인하고, 하나라도 없으면 "이 브라우저는 지원하지 않아요" 안내와 지원 브라우저 목록을 보인다. 그래서 더 오래된 버전도 기능이 모두 있으면 열린다. 다만 동작을 보증하지는 않는다.
- **보안 연결을 먼저 확인한다.** `crypto.subtle`, Web Locks, `navigator.storage.persist()`는 HTTPS나 localhost 같은 보안 컨텍스트에서만 동작한다. 사내망 IP의 http 주소나 `file://`로 열면 최신 브라우저여도 이 기능이 없다. 그래서 `window.isSecureContext`가 거짓이면 브라우저 안내 대신 "HTTPS 주소로 열어 주세요" 안내를 보인다.
- **모바일 브라우저**(iOS Safari, Android Chrome)는 기능이 있으면 열리고, 좁은 화면에서는 트리를 접을 수 있다. 하지만 E2E로 보증하지 않는다.
- Vite 빌드 대상(`target`)도 이 범위에 맞춘다.

## 결과

- 폴리필과 대체 라이브러리 없이 번들을 작게 유지한다.
- 지원하지 않는 브라우저나 보안 연결이 아닌 주소에서, 사용자는 앱이 열리지 않는 이유를 안내 화면에서 확인한다.
- Playwright의 WebKit은 실제 Safari와 완전히 같지 않다. E2E가 Safari 동작을 완전히 보증하지는 못하므로, 출시 전에 실제 Safari에서 주요 흐름을 한 번 확인한다.
- 지원 범위를 넓혀야 하면 부족한 기능별로 대체 방법을 새 ADR로 다룬다.
