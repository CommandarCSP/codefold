# @codefold/zip-editor

ZIP 파일을 업로드해 안의 파일을 수정하고, 수정한 내용이 반영된 ZIP을 다시 다운로드하는 웹 앱입니다. 운영 주소는 [https://codefold-zip-editor.vercel.app](https://codefold-zip-editor.vercel.app)입니다.

이 앱은 저장소의 패키지를 가져다 쓰는 첫 번째 사례입니다. `@codefold/react-code-editor`가 트리·탭·에디터 화면을 그립니다. 앱은 ZIP을 열고 다시 만드는 일과, 작업 내용을 잃지 않게 저장하는 일을 맡습니다. 저장소 전체의 구조와 결정은 [루트 README](../../README.md)에 있습니다.

## 앱이 하는 일

아래는 에디터 패키지가 하지 않아 앱이 직접 맡는 일입니다.

| 일 | 내용 | 코드 |
|---|---|---|
| ZIP 열기 | 파일을 고르거나 끌어 놓으면 Web Worker에서 ZIP 안의 파일 목록을 읽어, 에디터에 넘길 파일 출처를 만듭니다. ZIP이 아니거나 손상된 파일이면 이유를 화면에 표시합니다. | [`openFlow.ts`](src/business/hooks/session/openFlow.ts), [`zipClient.ts`](src/services/zip/zipClient.ts) |
| 다운로드 | 에디터에서 받은 목록대로 Worker가 새 ZIP을 만들고, 원래 ZIP 이름으로 저장합니다. | [`downloadFlow.ts`](src/business/hooks/session/downloadFlow.ts) |
| 자동 저장과 복원 | 수정한 내용, 트리 변경, 탭 배치를 IndexedDB에 저장합니다. 앱을 다시 열면 이어서 할지 고르는 창이 뜹니다. | [`autosave/`](src/business/hooks/autosave), [`restoreFlow.ts`](src/business/hooks/session/restoreFlow.ts), [`workspaceRepository.ts`](src/services/storage/workspaceRepository.ts) |
| 편집 잠금 | 같은 작업을 브라우저 탭 두 개에서 열면 저장한 내용이 서로 덮어써지므로, 한 번에 탭 하나에서만 편집할 수 있게 합니다. | [`lockFlow.ts`](src/business/hooks/session/lockFlow.ts), [`editLock.ts`](src/services/lock/editLock.ts) |
| 화면 구성 | 상단 막대, 알림, 빈 화면, 테마(라이트·다크·시스템), 좁은 화면에서 트리를 여닫는 버튼입니다. | [`components/`](src/components) |

## 실행

아래 명령은 모두 저장소 루트에서 실행합니다. 처음이면 먼저 `pnpm install`을 합니다.

| 명령 | 하는 일 |
|---|---|
| `pnpm dev` | 개발 서버(http://localhost:5173). 패키지 소스를 직접 읽으므로 패키지를 수정해도 화면에 바로 반영됩니다. |
| `pnpm --filter @codefold/zip-editor samples` | 직접 시험해 볼 샘플 ZIP 여섯 개를 `apps/zip-editor/samples/`에 만듭니다. |
| `pnpm --filter @codefold/zip-editor test` | 단위·통합 테스트 |
| `pnpm --filter @codefold/zip-editor test:e2e` | E2E 테스트(Playwright). 앱을 빌드하고 미리보기 서버를 띄운 뒤 실행합니다. |
| `pnpm --filter @codefold/zip-editor check:bundle` | 빌드 결과에서 첫 화면이 내려받는 JS가 gzip 기준 150KB 이하인지 검사합니다. |
| `pnpm --filter @codefold/zip-editor perf` | 브라우저 성능 측정. 결과는 [성능 보고서](../../docs/performance-report.md)에 정리했습니다. |
| `pnpm deploy:prod` | 운영 사이트에 배포합니다. 배포 방식은 [ADR-0043](../../docs/adr/0043-manual-prebuilt-deploy.md)에 적었습니다. |

## 패키지를 어떻게 조립했나

앱은 다른 서비스가 쓸 때와 똑같이 패키지의 공개 API만 씁니다.

| 패키지 | 앱이 쓰는 것 |
|---|---|
| `@codefold/react-code-editor` | `<CodeEditor>`와 제어 API(수정된 파일 목록, 다운로드할 목록 만들기, 변경 알림) |
| `@codefold/zip-archive` | ZIP 안의 파일 목록 읽기, 파일 하나 꺼내기, 새 ZIP 만들기는 Worker 안에서 합니다. 메인 스레드는 업로드 오류를 구분할 때 오류 클래스(`NotZipError` 등)만 씁니다. |
| `@codefold/virtual-fs` | 파일 출처(`FileSource`)와 트리 변경(`TreeChange`)의 타입만 씁니다. |

### 1. ZIP을 파일 출처로 바꿔 에디터에 넘긴다

에디터는 ZIP 형식을 다루지 않고 파일 출처만 받습니다. 앱은 업로드한 ZIP을 Worker에 넘기고, Worker와 메시지를 주고받는 객체(`ZipSource`)를 만듭니다. 이 객체는 파일 출처에 필요한 기능(목록 주기, 앞부분 읽기, 전체 읽기)을 갖추고, 새 ZIP을 만드는 `exportZip`이 하나 더 있습니다.

```tsx
// src/components/domain/workspace/EditorHost.tsx
<CodeEditor
  key={workspace.id}
  source={workspace.source}               // ZipSource: 파일 출처 + exportZip
  initialSnapshot={workspace.snapshot}    // 복원할 때 저장해 둔 수정 내용·트리 변경·탭 배치
  createWorker={createMonacoWorker}       // Monaco 언어 Worker를 만드는 함수. Worker를 불러오는 방식이 번들러(Vite)마다 달라 앱이 정한다
  theme={theme}
  treeMode={narrow ? 'overlay' : 'docked'}
  treeOpen={treeOpen}                     // 좁은 화면에서 트리가 열려 있는지. 여닫는 버튼은 앱이 그린다
  onTreeOpenChange={onTreeOpenChange}     // 트리에서 파일을 고르면 false로 부른다
  onReady={(controller) => onReady(workspace.id, controller)}
/>
```

`key`에 작업 공간 번호(`workspace.id`)를 넘기므로, 새 ZIP을 열면 에디터가 처음부터 새로 만들어집니다.

### 2. 제어 API로 다운로드·자동 저장·잠금을 잇는다

`onReady`로 받은 제어 API(`controller`)가 앱과 에디터를 잇는 유일한 통로입니다.

다운로드를 예로 들면, 앱은 `createExportPlan()`으로 파일마다 "원본 그대로" 또는 "새 내용"을 받아 `source.exportZip()`에 넘깁니다. 새 ZIP을 저장한 뒤에는 `markExported()`를 불러 받지 않은 변경을 비웁니다.

| 앱의 일 | 부르는 제어 API |
|---|---|
| 다운로드 | `createExportPlan()`, `markExported()` |
| 다운로드 버튼과 "받지 않은 변경 N개" | `onChangesChange`, `onUnexportedChange` |
| 자동 저장 | `onContentChange`, `onDirtyChange`, `onTreeChange`, `onLayoutChange`로 무엇이 바뀌었는지 받고, `getSnapshotFor(paths)`로 바뀐 파일의 내용만 읽어 저장합니다. |
| 편집 잠금을 잃었을 때 | `setReadOnly(true)` |

### 3. 첫 화면에는 에디터를 넣지 않는다

`<CodeEditor>`를 타입이 아닌 값으로 import하는 파일은 [`EditorHost.tsx`](src/components/domain/workspace/EditorHost.tsx) 하나입니다. 앱은 이 파일을 ZIP을 열기 시작할 때 동적 import로 불러옵니다. 그래서 Monaco와 dockview는 첫 화면 JS에 들어가지 않고, 첫 화면에는 업로드 영역만 있습니다([ADR-0027](../../docs/adr/0027-performance-budgets.md)). 이 규칙은 ESLint가 검사합니다.

## 코드 구조

앱 코드는 다섯 층으로 나눕니다. 위 층은 아래 층만 가져다 씁니다.

| 층 | 폴더 | 하는 일 |
|---|---|---|
| 페이지 | [`pages/`](src/pages) | 화면 배치 |
| 화면 컴포넌트 | [`components/`](src/components) | 비즈니스 훅이 준 값을 그리기만 합니다. `view/`는 props만 받는 컴포넌트, `domain/`은 훅과 view를 잇는 컴포넌트입니다. |
| 비즈니스 훅 | [`business/`](src/business) | 업로드, 다운로드, 복원, 잠금 같은 흐름과 규칙 |
| 스토어 | [`store/`](src/store) | 앱 상태(Zustand) |
| 서비스 | [`services/`](src/services) | IndexedDB, Web Locks, Worker 같은 브라우저 기능. 브라우저 기능은 이 층에서만 다룹니다. |

화면 문구는 [`utils/messages.ts`](src/utils/messages.ts) 한 곳에 모았습니다([ADR-0015](../../docs/adr/0015-ui-language-korean.md)).

## 관련 문서

- [E2E 테스트](e2e/): 기능별 브라우저 테스트
- [직접 해 보는 테스트 시나리오](../../docs/manual-test-scenarios.md)
- [성능 보고서](../../docs/performance-report.md)
