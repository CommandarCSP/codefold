/* eslint-disable react-refresh/only-export-components -- 테스트 도우미라 fast refresh 대상이 아니다 */
import { render } from '@testing-library/react';
import { DockviewReact, type IDockviewPanelProps } from 'dockview-react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import type { FileSource } from '@codefold/virtual-fs';
import { useState, type FunctionComponent } from 'react';
import { AreaContext } from '../src/area/area-context';
import { createDockviewArea, FILE_PANEL, type DockviewArea } from '../src/area/dockview-area';
import { defaultMessages } from '../src/messages';
import { createEditorWorkspace } from '../src/workspace';
import { memorySource } from './helpers';

/** 파일 경로만 그리는 가짜 패널. 영역 로직만 볼 때 쓴다. */
export function ProbePanel({ params }: IDockviewPanelProps<{ path: string }>) {
  return <div data-probe={params.path} />;
}

/**
 * dockview와 작업 공간, 에디터 영역을 그린다. 파일 목록이나 `FileSource`를 받고,
 * `panel`로 패널 컴포넌트를 바꿀 수 있다.
 */
export async function renderArea(
  input: Parameters<typeof memorySource>[0] | FileSource,
  panel: FunctionComponent<IDockviewPanelProps<{ path: string }>> = ProbePanel,
) {
  const source = 'readAll' in input ? input : memorySource(input);
  const workspace = await createEditorWorkspace({ source, monaco });
  let resolve: (area: DockviewArea) => void = () => undefined;
  const ready = new Promise<DockviewArea>((done) => {
    resolve = done;
  });
  function Harness() {
    const [area, setArea] = useState<DockviewArea>();
    return (
      <AreaContext value={{ workspace, area, messages: defaultMessages }}>
        <div style={{ height: 400, width: 800 }}>
          <DockviewReact
            components={{ [FILE_PANEL]: panel }}
            onReady={(event) => {
              const created = createDockviewArea({ api: event.api, workspace, monaco });
              workspace.attachArea(created);
              setArea(created);
              resolve(created);
            }}
          />
        </div>
      </AreaContext>
    );
  }
  const view = render(<Harness />);
  const area = await ready;
  return { workspace, area, view };
}
