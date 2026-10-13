// apps/zip-editor/src/components/domain/workspace/EditorHost.tsx
import { CodeEditor } from '@codefold/react-code-editor';
import '@codefold/react-code-editor/styles.css';
import type { EditorHostProps } from '@/business/hooks/workspace/editorModule';
import { createMonacoWorker } from '@/services/monaco/createMonacoWorker';

/**
 * 에디터 청크의 진입점. `@codefold/react-code-editor`를 값으로 import하는 파일은 이것 하나다(ADR-0022, ADR-0027).
 * 작업 공간 번호를 key로 주어, 새 ZIP·다시 시도 때 작업 공간을 새로 만든다.
 */
export function EditorHost({
  workspace,
  theme,
  narrow,
  treeOpen,
  onTreeOpenChange,
  onReady,
  onError,
}: EditorHostProps) {
  return (
    <CodeEditor
      key={workspace.id}
      source={workspace.source}
      initialSnapshot={workspace.snapshot}
      createWorker={createMonacoWorker}
      theme={theme}
      treeMode={narrow ? 'overlay' : 'docked'}
      treeOpen={treeOpen}
      onTreeOpenChange={onTreeOpenChange}
      onReady={(controller) => onReady(workspace.id, controller)}
      onError={(error) => onError(workspace.id, error)}
    />
  );
}
