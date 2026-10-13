import type { NameProblem } from '@codefold/virtual-fs';

/**
 * 화면 문구(ADR-0015). 기본값은 한국어이고, `resolveMessages`에 일부만 넘기면 그 문구만 바뀐다.
 * `{name}` 같은 자리 표시자는 `formatMessage`로 채운다.
 */
export interface CodeEditorMessages {
  readonly treeLabel: string;
  readonly treeToolbarLabel: string;
  readonly newFile: string;
  readonly newFolder: string;
  readonly rename: string;
  readonly delete: string;
  readonly revert: string;
  /** 스크린 리더가 읽는 수정 표시. */
  readonly modified: string;
  readonly folderModified: string;
  readonly newFileInputLabel: string;
  readonly newFolderInputLabel: string;
  readonly renameInputLabel: string;
  readonly nameEmpty: string;
  readonly nameReserved: string;
  readonly nameInvalidCharacter: string;
  readonly nameDuplicate: string;
  readonly deleteConfirmTitle: string;
  /** `{name}`: 지우려는 항목 이름. */
  readonly deleteConfirmDescription: string;
  readonly deleteConfirmAction: string;
  readonly revertConfirmTitle: string;
  /** `{name}`: 되돌리려는 파일 이름. */
  readonly revertConfirmDescription: string;
  readonly revertConfirmAction: string;
  readonly cancel: string;
  /** `{name}`: 자리 표시자. */
  readonly closeTab: string;
  readonly noOpenTab: string;
  readonly splitRight: string;
  readonly fileLoading: string;
  readonly readFailed: string;
  readonly retry: string;
  readonly binaryNotice: string;
  /** `{size}`, `{reason}`: 자리 표시자. */
  readonly binaryDetails: string;
  /** `{signature}`: 자리 표시자. */
  readonly reasonSignature: string;
  readonly reasonExtension: string;
  readonly reasonNul: string;
  readonly reasonUndecodable: string;
  readonly reasonContent: string;
  readonly eucKrNotice: string;
  readonly convertToUtf8: string;
  /** `{extension}`, `{kind}`: 자리 표시자. */
  readonly kindConflict: string;
  readonly kindText: string;
  readonly kindImage: string;
  readonly kindBinary: string;
  readonly largeFileNotice: string;
  readonly hugeFileNotice: string;
  readonly viewAsCode: string;
  readonly viewAsImage: string;
  readonly editorLoading: string;
}

export const defaultMessages: CodeEditorMessages = {
  treeLabel: '파일 트리',
  treeToolbarLabel: '파일 트리 도구',
  newFile: '새 파일',
  newFolder: '새 폴더',
  rename: '이름 바꾸기',
  delete: '삭제',
  revert: '변경 되돌리기',
  modified: '수정됨',
  folderModified: '안에 수정된 파일 있음',
  newFileInputLabel: '새 파일 이름',
  newFolderInputLabel: '새 폴더 이름',
  renameInputLabel: '새 이름',
  nameEmpty: '이름을 입력해 주세요',
  nameReserved: '. 이나 .. 은 이름으로 쓸 수 없어요',
  nameInvalidCharacter: '/, \\, 제어 문자는 이름에 쓸 수 없어요',
  nameDuplicate: '같은 이름이 이미 있어요',
  deleteConfirmTitle: '수정한 파일이 함께 지워져요',
  deleteConfirmDescription:
    '{name} 안에 수정한 파일이 있어요. 지우면 수정한 내용을 되살릴 수 없어요.',
  deleteConfirmAction: '삭제',
  revertConfirmTitle: '변경을 되돌릴까요?',
  revertConfirmDescription:
    '{name}을(를) 원본 내용으로 되돌려요. 수정한 내용과 실행 취소 기록은 되살릴 수 없어요.',
  revertConfirmAction: '되돌리기',
  cancel: '취소',
  closeTab: '{name} 닫기',
  noOpenTab: '파일 트리에서 파일을 고르세요',
  splitRight: '오른쪽으로 나누기',
  fileLoading: '파일을 여는 중이에요',
  readFailed: '파일을 읽지 못했어요',
  retry: '다시 시도',
  binaryNotice: '편집할 수 없는 파일이에요',
  binaryDetails: '크기 {size} · 판단 근거: {reason}',
  reasonSignature: '파일 앞부분의 형식 표시({signature})',
  reasonExtension: '확장자',
  reasonNul: '글자가 아닌 바이트(NUL)',
  reasonUndecodable: '글자로 읽을 수 없는 내용',
  reasonContent: '파일 내용',
  eucKrNotice: 'EUC-KR로 추정되는 파일이라 읽기 전용으로 열었어요.',
  convertToUtf8: 'UTF-8로 바꿔 편집',
  kindConflict: '확장자({extension})와 달리 내용은 {kind} 파일로 보여요.',
  kindText: '텍스트',
  kindImage: '이미지',
  kindBinary: '바이너리',
  largeFileNotice: '큰 파일이라 구문 강조와 접기를 껐어요.',
  hugeFileNotice: '아주 큰 파일이라 구문 강조·접기·자동완성·오류 표시를 모두 껐어요.',
  viewAsCode: '코드로 보기',
  viewAsImage: '이미지로 보기',
  editorLoading: '에디터를 불러오는 중이에요',
};

/** 기본 문구에 바꿀 문구만 덮어쓴다. `undefined`로 준 키는 무시한다. */
export function resolveMessages(overrides?: Partial<CodeEditorMessages>): CodeEditorMessages {
  if (!overrides) return defaultMessages;
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  );
  return { ...defaultMessages, ...defined };
}

/** `{키}` 자리 표시자를 채운다. 값이 없는 자리 표시자는 그대로 둔다. */
export function formatMessage(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

/** 이름을 쓸 수 없는 이유의 문구. */
export function nameProblemMessage(messages: CodeEditorMessages, problem: NameProblem): string {
  switch (problem) {
    case 'empty':
      return messages.nameEmpty;
    case 'reserved':
      return messages.nameReserved;
    case 'invalid-character':
      return messages.nameInvalidCharacter;
    case 'duplicate':
      return messages.nameDuplicate;
  }
}
