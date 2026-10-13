# 아키텍처 결정 기록 (ADR)

이 폴더에는 프로젝트를 만들면서 내린 주요 기술 결정을 하나씩 기록합니다. 각 문서는 **무엇을 정했고, 어떤 선택지가 있었고, 왜 이것을 골랐고, 그 결과 무엇을 감수하는지**를 담습니다.

README의 아키텍처 설명, 개발자 핸드북, 사용자 가이드는 이 기록을 원본으로 삼습니다.

## 작성 규칙

ADR을 새로 쓰거나 고칠 때는 다음 세 가지를 지킵니다.

- 파일 이름은 `NNNN-짧은-제목.md` 형식으로 짓고, 번호는 순서대로 붙입니다.
- 한 번 확정한 결정은 내용을 고치지 않습니다. 결정이 바뀌면 새 ADR을 만들고, 이전 문서의 상태를 `대체됨 (ADR-NNNN)`으로 바꿉니다.
- 상태는 `제안`, `승인`, `대체됨` 중 하나입니다. 결정의 일부만 바뀌었으면 `승인`을 유지하고 괄호 안에 바뀐 부분과 새 ADR 번호를 적습니다(예: `승인 (일부 대체: 0014)`).

## 목록

> 패키지 이름은 ADR-0023에서 `@codefold/*`로 바뀌었다. 그보다 앞선 ADR은 옛 이름(`@zip-editor/*`)을 쓰므로 ADR-0023의 대응표로 옮겨 읽는다.

지금까지 기록한 결정을 번호순으로 모았습니다.

| 번호 | 제목 | 상태 | 날짜 |
|---|---|---|---|
| [0001](0001-zip-parser-in-house.md) | ZIP 파서를 직접 구현한다 | 승인 (일부 대체: 0037) | 2026-09-27 |
| [0002](0002-styling-tailwind-shadcn.md) | 스타일링은 Tailwind CSS v4와 shadcn/ui로 한다 | 승인 | 2026-09-27 |
| [0003](0003-monorepo-package-split.md) | 모노레포로 코어·에디터·앱 패키지를 나눈다 | 승인 (일부 대체: 0023) | 2026-09-27 |
| [0004](0004-turborepo-task-runner.md) | pnpm workspace 위에 Turborepo를 쓴다 | 승인 | 2026-09-27 |
| [0005](0005-internal-package-dual-exports.md) | 내부 패키지는 개발 중엔 소스를, 외부엔 빌드 결과물을 내보낸다 | 승인 | 2026-09-27 |
| [0006](0006-monaco-model-as-content-source.md) | 파일 내용의 원본은 Monaco model이고, React 상태에는 메타데이터만 둔다 | 승인 | 2026-09-27 |
| [0007](0007-dockview-editor-area.md) | 에디터 영역에 dockview로 분할·플로팅 도킹을 넣는다 | 승인 (플로팅은 0042로 일부 대체) | 2026-09-27 |
| [0008](0008-autosave-working-copy.md) | 저장 개념 없이 고친 내용을 곧 작업본으로 삼는다 | 승인 (일부 대체: 0014) | 2026-09-27 |
| [0009](0009-modified-vs-unexported-state.md) | "원본과 달라짐"과 "다운로드 후 또 고침"을 따로 관리한다 | 승인 (일부 대체: 0014) | 2026-09-27 |
| [0010](0010-file-kind-detection.md) | 파일 종류 판단을 독립 패키지로 두고 단계별로 판단한다 | 승인 (일부 대체: 0023, 0031) | 2026-09-27 |
| [0011](0011-git-branch-and-commit-convention.md) | 기능 브랜치 + `--no-ff` 병합, Conventional Commits(설명은 한국어)를 쓴다 | 승인 (일부 대체: 0023) | 2026-09-27 |
| [0012](0012-file-tree-operations.md) | 파일 트리에서 추가·삭제·이름 변경을 지원하고, 옮기기는 넣지 않는다 | 승인 (확인창 관리 방식은 0035로 일부 대체) | 2026-09-27 |
| [0013](0013-deploy-vercel-and-ci.md) | Vercel로 데모를 배포하고 GitHub Actions로 CI를 돌린다 | 승인 (배포 방식은 0043으로 일부 대체) | 2026-09-27 |
| [0014](0014-session-persistence-indexeddb.md) | 작업 상태를 IndexedDB에 자동 저장하고, 잃을 수 있을 때만 이탈 경고를 띄운다 | 승인 | 2026-09-27 |
| [0015](0015-ui-language-korean.md) | 화면 문구는 한국어로 쓰고 한 곳에 모은다 | 승인 | 2026-09-27 |
| [0016](0016-workspace-layer-and-ports.md) | 가운데에 workspace 계층을 두고, 패키지끼리는 서로 import하지 않는다 | 승인 (일부 대체: 0022, 0023, 0037) | 2026-09-27 |
| [0017](0017-factory-interfaces-and-plain-data.md) | 공개 API는 interface와 팩토리 함수로, 데이터는 순수 객체로 만든다 | 승인 | 2026-09-27 |
| [0018](0018-toolchain-versions.md) | TypeScript 6.0과 ESLint 9를 쓴다 | 승인 | 2026-09-27 |
| [0019](0019-react-compiler.md) | React Compiler로 메모이제이션을 자동화한다 | 승인 | 2026-09-27 |
| [0020](0020-cn-with-clsx-tailwind-merge.md) | `cn()`은 clsx와 tailwind-merge로 만들고, shadcn의 `cn` 패키지는 쓰지 않는다 | 승인 | 2026-09-27 |
| [0021](0021-monaco-direct-without-wrapper.md) | Monaco는 React 래퍼 없이 `monaco-editor`를 직접 쓴다 | 승인 | 2026-09-27 |
| [0022](0022-react-ui-package.md) | 완성형 에디터 UI를 `@zip-editor/react` 패키지로 내보내고, 앱은 그 첫 번째 사용처가 된다 | 승인 (일부 대체: 0023) | 2026-09-27 |
| [0023](0023-package-naming-codefold.md) | 패키지 scope를 `@codefold`로 하고, 이름에 역할이 드러나게 짓는다 | 승인 | 2026-09-27 |
| [0024](0024-single-tab-edit-lock.md) | 편집 권한을 브라우저 탭 하나에만 준다 | 승인 | 2026-09-27 |
| [0025](0025-download-record-content-hash.md) | 다운로드 기록을 내용 지문으로 남겨 새로고침 뒤에도 "받지 않은 변경"을 판정한다 | 승인 | 2026-09-27 |
| [0026](0026-monaco-language-loading.md) | Monaco 언어는 전부 등록하고, 실제 규칙은 그 언어 파일을 열 때 불러온다 | 승인 | 2026-09-27 |
| [0027](0027-performance-budgets.md) | 성능 목표를 숫자로 정하고, CI에서 계속 잰다 | 승인 (렌더 검사 방법은 0045로 일부 대체) | 2026-09-27 |
| [0028](0028-zip-work-in-web-worker.md) | ZIP 읽기·압축 해제·재압축은 Web Worker에서 한다 | 승인 | 2026-09-27 |
| [0029](0029-virtualized-file-tree.md) | 파일 트리는 평평한 목록으로 바꿔 화면에 보이는 줄만 그린다 | 승인 | 2026-09-27 |
| [0030](0030-browser-support.md) | 지원 브라우저는 Chrome·Edge·Firefox·Safari의 최신 두 버전이다 | 승인 | 2026-09-27 |
| [0031](0031-file-kind-detection-revised.md) | 파일 종류 판단에서 이미지 확장자보다 내용을 믿고, 결과 타입을 구현에 맞춘다 | 승인 (BOM 규칙은 0044로 일부 대체) | 2026-09-27 |
| [0032](0032-export-write-keeps-original-path.md) | 내보내기 계획의 "새 내용" 항목에 원래 경로를 적는다 | 승인 | 2026-09-27 |
| [0033](0033-export-keeps-empty-directories.md) | 다운로드 ZIP에 빈 폴더를 남긴다 | 승인 | 2026-09-27 |
| [0034](0034-react-code-editor-vite-library-build.md) | `@codefold/react-code-editor`는 Vite 라이브러리 모드로 빌드한다 | 승인 | 2026-09-27 |
| [0035](0035-library-dialogs-without-nice-modal.md) | 라이브러리 안의 확인창은 nice-modal 없이 띄운다 | 승인 | 2026-09-27 |
| [0036](0036-hidden-entries-follow-tree-folders.md) | 트리 폴더 안의 숨긴 항목은 그 폴더의 삭제·이름 변경을 따른다 | 승인 | 2026-09-27 |
| [0037](0037-zip-name-decoding-and-blob-write.md) | ZIP 이름은 유니코드 경로 확장 필드도 읽고, 새 ZIP은 조각을 이어 붙인 Blob으로 만든다 | 승인 | 2026-09-27 |
| [0038](0038-zip-slip-entries-exported-unchanged.md) | `..`이 든 항목은 경고 없이 내려받은 ZIP에 원본 그대로 넣는다 | 승인 | 2026-09-28 |
| [0039](0039-read-only-tab-after-losing-lock.md) | 편집 잠금을 잃은 탭은 안내만 보이고, 다운로드는 되지만 다운로드 기록은 저장하지 않는다 | 승인 | 2026-09-28 |
| [0040](0040-pending-save-and-protecting-saved-copy.md) | 이탈 경고는 레이아웃 변경을 세지 않고, 복원 실패 화면에서 새 ZIP을 열 때도 확인한다 | 승인 | 2026-09-28 |
| [0041](0041-indexeddb-zip-store-and-workspace-id.md) | 원본 ZIP은 별도 저장소에 두고, 저장본에 작업 공간 id를 붙인다 | 승인 | 2026-09-28 |
| [0042](0042-remove-floating-groups.md) | 에디터 영역에 떠 있는 그룹을 두지 않는다 | 승인 | 2026-09-28 |
| [0043](0043-manual-prebuilt-deploy.md) | 운영 배포는 git 정보 없이 로컬 빌드 결과를 올린다 | 승인 | 2026-09-29 |
| [0044](0044-bom-must-decode.md) | BOM이 있어도 그 인코딩으로 읽혀야 텍스트로 판단한다 | 승인 | 2026-09-29 |
| [0045](0045-render-count-via-devtools-hook.md) | 렌더 횟수는 운영 빌드에서 개발자 도구 훅으로 센다 | 승인 | 2026-09-29 |
| [0046](0046-floating-dismissible-notices.md) | 사건 알림은 화면 아래에 떠 있는 알림으로 띄우고, 사용자가 닫는다 | 승인 | 2026-09-29 |
