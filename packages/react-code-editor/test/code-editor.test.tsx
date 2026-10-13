import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { FileSource } from '@codefold/virtual-fs';
import { CodeEditor } from '../src/code-editor';
import type { CodeEditorController } from '../src/controller';
import { loadMonaco } from '../src/monaco/load-monaco';
import { memorySource, typeInto } from './helpers';

const createWorker = () => ({}) as Worker;
const items: Parameters<typeof memorySource>[0] = [
  ['src/a.py', 'a'],
  ['README.md', 'r'],
];

const mount = async (props: Partial<Parameters<typeof CodeEditor>[0]> = {}) => {
  let controller: CodeEditorController | undefined;
  const source = memorySource(items);
  const view = render(
    <div style={{ height: 600, width: 1200 }}>
      <CodeEditor
        source={source}
        createWorker={createWorker}
        onReady={(ready) => (controller = ready)}
        {...props}
      />
    </div>,
  );
  await waitFor(() => expect(controller).toBeDefined(), { timeout: 10_000 });
  return { controller: controller!, view, source };
};

// monaco-editor 전체를 처음 불러오는 데 몇 초 걸린다. 병렬 실행에서도 각 테스트 시간 제한에 걸리지 않게 먼저 불러 둔다.
beforeAll(() => loadMonaco(createWorker), 60_000);

describe('<CodeEditor> (Task 5)', () => {
  test('FileSource와 worker 함수만 넘기면 트리·탭·에디터가 동작한다', async () => {
    const { controller } = await mount();
    expect(screen.getByRole('tree')).toBeInTheDocument();
    act(() => controller.openFile('README.md'));
    await waitFor(() => expect(document.querySelector('.monaco-editor')).not.toBeNull());
  });

  test('불러오는 동안 안내를 보인다', () => {
    render(<CodeEditor source={memorySource(items)} createWorker={createWorker} />);
    expect(screen.getByText('에디터를 불러오는 중이에요')).toBeInTheDocument();
  });

  test('제어 API는 떼어 넘겨도 동작하고, 스냅샷에 레이아웃을 담는다', async () => {
    const { controller } = await mount();
    const { openFile, getSnapshot, hasChanges, onChangesChange, onLayoutChange } = controller;
    const changes: boolean[] = [];
    const layouts: unknown[] = [];
    onChangesChange((has) => changes.push(has));
    onLayoutChange((layout) => layouts.push(layout));
    act(() => openFile('src/a.py'));
    const monaco = await loadMonaco(createWorker);
    await waitFor(() => expect(monaco.editor.getModels().length).toBeGreaterThan(0));
    const model = monaco.editor.getModels().find((m) => m.uri.path === '/src/a.py')!;
    act(() => typeInto(model, '!'));
    expect(hasChanges()).toBe(true);
    expect(changes).toEqual([true]);
    // dockview는 레이아웃 알림을 모아 비동기로 낸다(AsapEvent).
    await waitFor(() => expect(layouts.length).toBeGreaterThan(0));
    const snapshot = await getSnapshot();
    expect(snapshot.contents).toEqual({ 'src/a.py': 'a!' });
    expect(snapshot.layout).not.toBeNull();
  });

  test('setReadOnly(true)면 트리 조작과 에디터 편집을 막는다', async () => {
    const { controller } = await mount();
    act(() => controller.openFile('README.md'));
    const monaco = await loadMonaco(createWorker);
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    act(() => controller.setReadOnly(true));
    expect(screen.getByRole('button', { name: '새 파일' })).toBeDisabled();
    await waitFor(() =>
      expect(monaco.editor.getEditors()[0]?.getOption(monaco.editor.EditorOption.readOnly)).toBe(
        true,
      ),
    );
  });

  test('theme을 바꾸면 모든 에디터의 Monaco 테마가 바뀐다', async () => {
    const monaco = await loadMonaco(createWorker);
    const setTheme = vi.spyOn(monaco.editor, 'setTheme');
    const { view } = await mount({ theme: 'light' });
    expect(setTheme).toHaveBeenLastCalledWith('codefold-light');
    view.rerender(
      <div style={{ height: 600, width: 1200 }}>
        <CodeEditor source={memorySource(items)} createWorker={createWorker} theme="dark" />
      </div>,
    );
    await waitFor(() => expect(setTheme).toHaveBeenLastCalledWith('codefold-dark'));
  });

  test('앱이 html의 class를 바꾸면(다크 전환) 새 CSS 변수로 Monaco 테마를 다시 만든다', async () => {
    const monaco = await loadMonaco(createWorker);
    const defineTheme = vi.spyOn(monaco.editor, 'defineTheme');
    await mount({ theme: 'dark' });
    const before = defineTheme.mock.calls.length;
    document.documentElement.classList.add('dark');
    await waitFor(() => expect(defineTheme.mock.calls.length).toBeGreaterThan(before));
    document.documentElement.classList.remove('dark');
  });

  test('StrictMode에서 두 번 마운트해도 작업 공간과 에디터가 하나만 남는다', async () => {
    let controller: CodeEditorController | undefined;
    const snapshot = {
      treeChanges: [],
      contents: { 'src/a.py': 'restored' },
      layout: null,
      downloadRecord: null,
    };
    render(
      <StrictMode>
        <div style={{ height: 600, width: 1200 }}>
          <CodeEditor
            source={memorySource(items)}
            createWorker={createWorker}
            initialSnapshot={snapshot}
            onReady={(ready) => (controller = ready)}
          />
        </div>
      </StrictMode>,
    );
    await waitFor(() => expect(controller).toBeDefined(), { timeout: 10_000 });
    const monaco = await loadMonaco(createWorker);
    expect(monaco.editor.getModels().filter((m) => m.uri.path === '/src/a.py')).toHaveLength(1);
    expect(controller!.getDirtyPaths()).toEqual(['src/a.py']);
  });

  test('StrictMode에서도 onReady는 한 번이고, 그 제어 API가 지금 영역의 레이아웃을 본다', async () => {
    const controllers: CodeEditorController[] = [];
    render(
      <StrictMode>
        <div style={{ height: 600, width: 1200 }}>
          <CodeEditor
            source={memorySource(items)}
            createWorker={createWorker}
            onReady={(ready) => controllers.push(ready)}
          />
        </div>
      </StrictMode>,
    );
    await waitFor(() => expect(controllers.length).toBeGreaterThan(0), { timeout: 10_000 });
    await new Promise((done) => setTimeout(done, 50));
    expect(controllers).toHaveLength(1);
    const layouts: unknown[] = [];
    controllers[0]!.onLayoutChange((layout) => layouts.push(layout));
    act(() => controllers[0]!.openFile('README.md'));
    await waitFor(() => expect(layouts.length).toBeGreaterThan(0));
    const { layout } = await controllers[0]!.getSnapshot();
    expect(JSON.stringify(layout)).toContain('README.md');
  });

  test('source를 바꾸면 처음 스냅샷을 새 작업 공간에 다시 쓰지 않는다', async () => {
    const controllers: CodeEditorController[] = [];
    const snapshot = {
      treeChanges: [],
      contents: { 'src/a.py': 'restored' },
      layout: null,
      downloadRecord: null,
    };
    const view = render(
      <div style={{ height: 600, width: 1200 }}>
        <CodeEditor
          source={memorySource(items)}
          createWorker={createWorker}
          initialSnapshot={snapshot}
          onReady={(ready) => controllers.push(ready)}
        />
      </div>,
    );
    await waitFor(() => expect(controllers).toHaveLength(1), { timeout: 10_000 });
    expect(controllers[0]!.getDirtyPaths()).toEqual(['src/a.py']);
    view.rerender(
      <div style={{ height: 600, width: 1200 }}>
        <CodeEditor
          source={memorySource(items)}
          createWorker={createWorker}
          onReady={(ready) => controllers.push(ready)}
        />
      </div>,
    );
    await waitFor(() => expect(controllers).toHaveLength(2), { timeout: 10_000 });
    expect(controllers[1]!.getDirtyPaths()).toEqual([]);
  });

  test('좁은 화면 모드로 바꿔 트리를 열어도 곧바로 닫지 않고, 이미 열린 파일을 다시 골라도 닫는다', async () => {
    const onTreeOpenChange = vi.fn();
    const { controller, view, source } = await mount();
    act(() => controller.openFile('README.md'));
    const rerender = (props: Partial<Parameters<typeof CodeEditor>[0]>) =>
      view.rerender(
        <div style={{ height: 600, width: 1200 }}>
          <CodeEditor source={source} createWorker={createWorker} {...props} />
        </div>,
      );
    rerender({ treeMode: 'overlay', treeOpen: true, onTreeOpenChange });
    await new Promise((done) => setTimeout(done, 50));
    expect(onTreeOpenChange).not.toHaveBeenCalled();
    act(() => controller.openFile('README.md'));
    expect(onTreeOpenChange).toHaveBeenCalledWith(false);
  });

  test('좁은 화면 모드에서 파일을 고르면 트리를 닫게 알린다', async () => {
    const onTreeOpenChange = vi.fn();
    const { controller } = await mount({ treeMode: 'overlay', treeOpen: true, onTreeOpenChange });
    act(() => controller.openFile('README.md'));
    await waitFor(() => expect(onTreeOpenChange).toHaveBeenCalledWith(false));
  });

  test('작업 공간을 만들다 실패하면 onError로 알린다', async () => {
    const onError = vi.fn();
    const broken: FileSource = {
      list: async () => {
        throw new Error('목록을 읽지 못함');
      },
      readHead: async () => new Uint8Array(),
      readAll: async () => new Uint8Array(),
    };
    render(<CodeEditor source={broken} createWorker={createWorker} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });
});
