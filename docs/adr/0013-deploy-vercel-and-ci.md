# ADR-0013. Vercel로 데모를 배포하고 GitHub Actions로 CI를 돌린다

- 상태: 승인 (배포 방식은 ADR-0043으로 일부 대체)
- 날짜: 2026-09-27

## 배경

저장소를 처음 보는 사람은 직접 실행하거나 데모 링크로 동작을 확인한다. 설치 없이 바로 열어 볼 수 있는 주소가 있으면 실행 환경 차이로 동작하지 않는 일을 막을 수 있다. 또 변경마다 타입 검사, 테스트, 빌드가 통과하는지 자동으로 보여 줘야 한다.

이 앱은 서버 없이 브라우저에서만 동작하는 정적 사이트다. 레포는 private이다.

## 선택지

배포할 곳과 CI 구성에 따라 네 가지를 비교했다.

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. Vercel 배포 + GitHub Actions CI | private 레포를 무료로 연결할 수 있다. push하면 자동으로 배포되고, 브랜치마다 미리보기 주소가 생긴다 | Vercel 계정 연결이 필요하다 |
| B. Cloudflare Pages 또는 Netlify + GitHub Actions CI | A와 기능이 거의 같다 | 이미 쓰는 계정이 없다면 A보다 나은 점이 없다 |
| C. GitHub Pages | 설정이 가장 단순하다 | private 레포에서는 유료 플랜이 필요하다. 브랜치별 미리보기가 없다 |
| D. 배포 없이 CI만 | 준비할 것이 가장 적다 | 보는 사람이 직접 설치하고 실행해야 한다 |

## 결정

**A를 택한다.**

### 배포 (Vercel)

- `main`에 병합하면 운영 주소로, 기능 브랜치에 push하면 브랜치별 미리보기 주소로 배포한다.
- Turborepo로 `apps/web`과 그 의존 패키지를 빌드한다. 결과물은 정적 파일이다.
- 운영 주소는 README 첫머리에 적는다.

### CI (GitHub Actions)

push와 pull request마다 다음을 실행한다.

1. 의존성 설치 (`pnpm install --frozen-lockfile`, pnpm 저장소 캐시)
2. 타입 검사, 린트
3. 단위·통합 테스트 (Vitest)
4. 빌드와 번들 크기 측정
5. E2E 테스트 (Playwright). 브라우저 내장 `DecompressionStream` 동작을 엔진마다 확인하기 위해 Chromium, Firefox, WebKit에서 모두 돌린다.

- 바뀌지 않은 패키지의 작업은 Turborepo 캐시로 건너뛴다.
- Node 버전은 레포에 고정하고(`.nvmrc`, `package.json`의 `engines`), CI도 같은 버전을 쓴다.
- README에 CI 상태 배지를 단다.

## 결과

- 누구나 링크 하나로 앱을 열어 볼 수 있다.
- 병합 전에 미리보기 주소에서 실제 화면을 확인할 수 있다.
- 모든 커밋이 타입 검사, 테스트, 세 브라우저 E2E를 통과했는지가 CI 기록으로 남는다.
- Vercel 계정과 GitHub 레포 연결은 사람이 직접 해야 한다.
