import { formatDateTime } from './format';

/**
 * 앱 화면 문구(ADR-0015). 컴포넌트에 문구를 직접 쓰지 않고 여기서 가져온다. 변수가 들어가는 문구는 함수다.
 * `<CodeEditor>` 안 문구는 그 패키지의 한국어 기본값을 쓴다.
 */
export const messages = {
  appTitle: 'ZIP 에디터',
  upload: 'ZIP 올리기',
  download: '다운로드',
  downloading: 'ZIP 만드는 중',
  unexported: (count: number) => `받지 않은 변경 ${count}개`,
  downloadDone: (zipName: string) => `${zipName} 다운로드를 마쳤어요`,
  downloadFailed: {
    title: 'ZIP을 만들지 못했어요',
    reason: {
      invalidItem: (path: string) =>
        `ZIP에 쓸 수 없는 이름이 있어요(${path.length > 80 ? `${path.slice(0, 80)}…` : path}). 이름을 바꾼 뒤 다시 시도해 주세요.`,
      missingData: '고친 파일의 내용을 읽지 못했어요. 다시 시도해 주세요.',
      unknown: '잠시 뒤 다시 시도해 주세요.',
    },
    outOfMemory: '파일이 커서 메모리가 모자랐을 수 있어요. 다른 탭을 닫고 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  treeToggle: '파일 트리 열기',
  theme: { label: '테마', light: '라이트', dark: '다크', system: '시스템' },
  empty: {
    title: 'ZIP 파일을 올려 주세요',
    description: 'ZIP 파일을 여기에 끌어 놓거나 올리기 버튼을 누르세요.',
  },
  opening: 'ZIP을 여는 중이에요',
  dropOverlay: '놓으면 이 ZIP을 엽니다',
  uploadNotice: {
    multiple: 'ZIP 파일 하나만 놓아 주세요.',
    notZip: 'ZIP 파일이 아니에요. 다른 파일을 골라 주세요.',
    corrupt: 'ZIP 파일이 손상되어 열 수 없어요.',
    encrypted: '암호가 걸린 ZIP은 열 수 없어요.',
    split: '여러 파일로 나뉜 ZIP은 열 수 없어요.',
    unknown: 'ZIP 파일을 열지 못했어요. 다시 시도해 주세요.',
  },
  largeZip: '메모리가 부족하면 다운로드가 실패할 수 있어요',
  autosaveHint: '변경 내용은 자동으로 저장됩니다',
  dismissNotice: '알림 닫기',
  storageUnavailable: '이 브라우저에 저장할 수 없어 새로고침하면 작업을 잃습니다',
  replace: {
    title: '새 ZIP을 열까요?',
    description: '아직 받지 않은 변경 내용이 사라져요.',
    unknownSaved: '되살리지 못한 이전 작업이 사라져요.',
    confirm: '새 ZIP 열기',
    cancel: '취소',
  },
  discardSaved: (zipName: string) => `이전 작업(${zipName})의 변경 내용을 버리고 새 ZIP을 열까요?`,
  restore: {
    title: '이전 작업을 이어서 할까요?',
    detail: (zipName: string, updatedAt: number, timeZone?: string) =>
      `${zipName} · 마지막 수정 ${formatDateTime(updatedAt, timeZone)}`,
    resume: '이어 하기',
    discard: '버리기',
  },
  restoreFailed: {
    title: '이전 작업을 되살리지 못했어요',
    description: '저장본은 그대로 두었어요. 다시 시도하거나 버릴 수 있어요.',
    retry: '다시 시도',
    discard: '버리기',
  },
  lock: {
    busy: '다른 탭에서 작업 중이에요',
    busyDescription:
      '편집은 한 번에 브라우저 탭 하나에서만 할 수 있어요. 여기서 열면 다른 탭은 읽기 전용이 돼요.',
    takeOver: '여기서 열기',
    granted: '이제 이 탭에서 편집할 수 있어요',
    grantedDescription: '편집하던 탭이 닫혀서 편집 권한이 이 탭으로 넘어왔어요.',
    start: '편집 시작',
  },
  readOnly: {
    title: '다른 탭으로 편집이 넘어갔어요',
    description:
      "이 탭은 읽기 전용이에요. 여기서 다시 편집하려면 새로고침한 뒤 '여기서 열기'를 누르세요.",
    unsavedLost: '마지막 입력은 새 탭에 반영되지 않았을 수 있어요.',
  },
  insecure: {
    title: 'HTTPS 주소로 열어 주세요',
    description: '보안 연결(HTTPS)이 아니면 자동 저장과 편집 잠금이 동작하지 않아요.',
  },
  unsupported: {
    title: '이 브라우저는 지원하지 않아요',
    description: '아래 브라우저의 최신 두 버전에서 열어 주세요.',
    browsers: ['Chrome', 'Edge', 'Firefox', 'Safari'],
  },
  errorKit: { runtime: '문제가 발생했습니다.', retry: '다시 시도' },
  rootError: {
    title: '문제가 발생했습니다',
    description: '페이지를 새로고침해 주세요. 작업은 마지막으로 저장된 때까지 남아 있어요.',
    reload: '새로고침',
  },
} as const;
