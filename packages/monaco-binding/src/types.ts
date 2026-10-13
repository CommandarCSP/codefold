import type * as api from 'monaco-editor/editor/editor.api.js';

/**
 * 이 패키지가 쓰는 Monaco API. 쓰는 쪽이 `import * as monaco from 'monaco-editor'`(또는 `editor.api`)로
 * 불러온 객체를 그대로 넘긴다. 이 패키지는 Monaco를 직접 import하지 않는다(ADR-0021).
 */
export type MonacoApi = Pick<typeof api, 'editor' | 'Uri' | 'KeyMod' | 'KeyCode'>;

export type TextModel = api.editor.ITextModel;
export type CodeEditor = api.editor.IStandaloneCodeEditor;
export type EditorOptions = api.editor.IStandaloneEditorConstructionOptions;
export type MonacoEnvironmentConfig = api.Environment;

/** 정리가 필요한 구독이나 객체(ADR-0017). */
export interface Disposable {
  dispose(): void;
}

/** 트리 구조 변경. `@codefold/virtual-fs`의 `TreeChange`와 모양이 같다(구조적 타입). */
export type StructureChange =
  | { readonly type: 'add'; readonly path: string }
  | { readonly type: 'delete'; readonly path: string }
  | { readonly type: 'rename'; readonly from: string; readonly to: string };

/** 다운로드 계획을 만든 순간의 버전 기록. 순수 데이터라 그대로 저장하거나 넘길 수 있다. */
export interface ExportSnapshot {
  /** 원본과 달라진 파일만 `경로 → getAlternativeVersionId()`. */
  readonly versions: Readonly<Record<string, number>>;
  readonly structureVersion: number;
}

/** 받지 않은 변경 상태. */
export interface UnexportedState {
  readonly has: boolean;
  /** 받지 않은 변경 경로 수. 이름 변경은 1개다. */
  readonly count: number;
}

/** 언어 이름(`typescript`, `json`, `css`, `html`, `editorWorkerService`)을 받아 worker를 만든다. */
export type WorkerFactory = (label: string) => Worker;
