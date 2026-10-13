import type { EditorOptions } from '@codefold/monaco-binding';

/** 모든 그룹 에디터에 쓰는 옵션. 쓰는 쪽 `editorOptions`가 이 위에 덮인다. */
export const EDITOR_OPTIONS: EditorOptions = {
  automaticLayout: true,
  // TypeScript·JavaScript 밖의 언어는 열린 모든 model의 단어를 자동완성 후보로 쓴다.
  wordBasedSuggestions: 'allDocuments',
  // 스크린 리더를 감지하면 스크린 리더 모드를 켠다.
  accessibilitySupport: 'auto',
  scrollBeyondLastLine: false,
  fixedOverflowWidgets: true,
  tabSize: 2,
};
