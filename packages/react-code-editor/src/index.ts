export { EditorArea } from './area/editor-area';
export type { EditorAreaProps } from './area/editor-area';
export type { DockviewArea, FilePanelParams } from './area/dockview-area';
export { CodeEditor } from './code-editor';
export type { CodeEditorProps } from './code-editor';
export type { CodeEditorController } from './controller';
export { CodeEditorError, FileChangedError, NotTextFileError } from './errors';
export type { WorkspaceExport } from './export-plan';
export { defaultMessages, formatMessage, resolveMessages } from './messages';
export type { CodeEditorMessages } from './messages';
export type { WorkspaceOperations } from './operations';
export type { EditingState, EditorActions, EditorState, EditorStore } from './store';
export { FileTree } from './tree/file-tree';
export type { FileTreeProps } from './tree/file-tree';
export { FileTreePanel } from './tree/file-tree-panel';
export type { FileTreePanelProps } from './tree/file-tree-panel';
export type { NameInputRow } from './tree/flatten';
export type {
  DownloadRecord,
  EditorAreaPort,
  ExportPlan,
  ExportRequest,
  LoadedFile,
  WorkspaceSnapshot,
} from './types';
export { createEditorWorkspace } from './workspace';
export type { CreateEditorWorkspaceOptions, EditorWorkspace } from './workspace';
export type { ThemeMode } from './monaco/theme';
