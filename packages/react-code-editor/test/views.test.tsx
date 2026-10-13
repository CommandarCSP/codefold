import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test, vi } from 'vitest';
import type { FileSource } from '@codefold/virtual-fs';
import { FilePanel } from '../src/views/file-panel';
import { renderArea } from './area-harness';
import { eucKr, memorySource, typeInto } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
const KOREAN = '안녕하세요 '.repeat(40);
const open = async (items: Parameters<typeof memorySource>[0], path: string) => {
  const context = await renderArea(items, FilePanel);
  act(() => context.workspace.openFile(path));
  return context;
};
const panelBody = () => document.querySelector<HTMLElement>('.dv-content-container')!;

describe('텍스트', () => {
  test('텍스트 파일은 그 그룹의 에디터로 연다', async () => {
    const { workspace } = await open([['a.py', 'print(1)']], 'a.py');
    await waitFor(() => expect(panelBody().querySelector('.monaco-editor')).not.toBeNull());
    expect(monaco.editor.getEditors()[0]?.getModel()).toBe(workspace.registry.get('a.py'));
  });

  test('같은 그룹에서 텍스트·이미지 탭을 오가도 에디터는 하나이고 커서가 되살아난다', async () => {
    const { workspace, area } = await open(
      [
        ['a.py', 'one\ntwo\nthree'],
        ['b.py', 'b'],
        ['logo.png', PNG],
      ],
      'a.py',
    );
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    const editor = monaco.editor.getEditors()[0]!;
    editor.setPosition({ lineNumber: 3, column: 2 });
    act(() => workspace.openFile('b.py'));
    await waitFor(() => expect(editor.getModel()).toBe(workspace.registry.get('b.py')));
    act(() => workspace.openFile('logo.png'));
    await screen.findByRole('img', { name: 'logo.png' });
    act(() => workspace.openFile('a.py'));
    await waitFor(() => expect(editor.getModel()).toBe(workspace.registry.get('a.py')));
    expect(editor.getPosition()).toMatchObject({ lineNumber: 3, column: 2 });
    expect(monaco.editor.getEditors()).toHaveLength(1);
    expect(area.api.groups).toHaveLength(1);
  });

  test('편집 잠금을 잃으면 에디터가 읽기 전용이 된다', async () => {
    const { workspace } = await open([['a.py', 'a']], 'a.py');
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    act(() => workspace.store.getState().setReadOnly(true));
    await waitFor(() =>
      expect(monaco.editor.getEditors()[0]?.getOption(monaco.editor.EditorOption.readOnly)).toBe(
        true,
      ),
    );
  });
});

describe('새 파일 포커스', () => {
  test('새 파일을 열며 포커스를 요청하면, 그 탭에 에디터가 붙은 뒤 에디터에 포커스가 간다', async () => {
    const { workspace } = await open([['a.py', 'a']], 'a.py');
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    const editor = monaco.editor.getEditors()[0]!;
    const node = workspace.createEntry('', 'new.py', false);
    act(() => {
      workspace.openFile(node.path);
      workspace.focusEditor(node.path);
    });
    await waitFor(() => expect(editor.getModel()).toBe(workspace.registry.get('new.py')));
    await waitFor(() => expect(editor.hasTextFocus()).toBe(true));
  });
});

describe('복원한 탭의 model 수명', () => {
  test('되살린 뒤 한 번도 보지 않은 탭을 닫아도 안 고친 model을 지운다', async () => {
    const items: Parameters<typeof memorySource>[0] = [
      ['a.py', 'a'],
      ['b.py', 'b'],
    ];
    const first = await renderArea(items, FilePanel);
    act(() => first.workspace.openFile('a.py'));
    act(() => first.workspace.openFile('b.py'));
    const saved = first.area.layout();
    first.view.unmount();
    first.workspace.dispose();

    const { workspace, area } = await renderArea(items, FilePanel);
    act(() => area.restoreLayout(saved));
    await waitFor(() => expect(workspace.registry.get('a.py')).toBeDefined());
    act(() => area.close('a.py'));
    expect(workspace.registry.get('a.py')).toBeUndefined();
  });
});

describe('이미지', () => {
  test('이미지는 파일 이름을 alt로 보이고, 탭을 닫으면 object URL을 해제한다', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { area } = await open([['logo.png', PNG]], 'logo.png');
    const image = await screen.findByRole('img', { name: 'logo.png' });
    expect(image.getAttribute('src')).toMatch(/^blob:/);
    act(() => area.close('logo.png'));
    expect(revoke).toHaveBeenCalledWith(image.getAttribute('src'));
  });

  test('SVG는 코드로 고친 뒤 이미지로 돌아오면 고친 모습으로 다시 그린다', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const { workspace } = await open([['icon.svg', SVG]], 'icon.svg');
    await screen.findByRole('img', { name: 'icon.svg' });
    fireEvent.click(screen.getByRole('button', { name: '코드로 보기' }));
    await waitFor(() => expect(workspace.registry.get('icon.svg')).toBeDefined());
    act(() => typeInto(workspace.registry.get('icon.svg')!, '<!-- 고침 -->'));
    fireEvent.click(await screen.findByRole('button', { name: '이미지로 보기' }));
    await screen.findByRole('img', { name: 'icon.svg' });
    const blob = create.mock.calls.at(-1)?.[0] as Blob;
    expect(await blob.text()).toBe(`${SVG}<!-- 고침 -->`);
  });
});

describe('바이너리', () => {
  test('편집 불가 안내와 크기·판단 근거를 보이고 에디터를 붙이지 않는다', async () => {
    await open([['data.bin', new Uint8Array([0, 1, 2, 3])]], 'data.bin');
    expect(await screen.findByText('편집할 수 없는 파일이에요')).toBeInTheDocument();
    expect(screen.getByText(/크기 4 B · 판단 근거:/)).toBeInTheDocument();
    expect(panelBody().querySelector('.monaco-editor')).toBeNull();
  });

  test('앞 8KB 뒤에 바이너리가 섞인 파일은 바이너리 보기로 연다', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('a'.repeat(9000)), 0, 1]);
    await open([['mixed.txt', bytes]], 'mixed.txt');
    expect(await screen.findByText('편집할 수 없는 파일이에요')).toBeInTheDocument();
  });
});

describe('안내', () => {
  test('EUC-KR은 읽기 전용으로 열고, UTF-8로 바꾸면 모든 그룹에서 편집할 수 있다', async () => {
    const { workspace, area } = await open([['old.txt', eucKr(KOREAN)]], 'old.txt');
    expect(await screen.findByText(/EUC-KR로 추정되는 파일/)).toBeInTheDocument();
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(1));
    act(() => area.splitActive());
    await waitFor(() => expect(monaco.editor.getEditors()).toHaveLength(2));
    for (const editor of monaco.editor.getEditors()) {
      expect(editor.getOption(monaco.editor.EditorOption.readOnly)).toBe(true);
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'UTF-8로 바꿔 편집' })[0]!);
    await waitFor(() => {
      for (const editor of monaco.editor.getEditors()) {
        expect(editor.getOption(monaco.editor.EditorOption.readOnly)).toBe(false);
      }
    });
    expect(screen.queryByText(/EUC-KR로 추정되는 파일/)).toBeNull();
    expect(workspace.store.getState().dirty).toEqual({ 'old.txt': true });
  });

  test('UTF-8로 바꾼 파일을 되돌리면 다시 읽기 전용이 되고 안내가 돌아온다', async () => {
    const { workspace } = await open([['old.txt', eucKr(KOREAN)]], 'old.txt');
    fireEvent.click(await screen.findByRole('button', { name: 'UTF-8로 바꿔 편집' }));
    await waitFor(() => expect(screen.queryByText(/EUC-KR로 추정되는 파일/)).toBeNull());
    await act(() => workspace.revertFile('old.txt'));
    expect(await screen.findByText(/EUC-KR로 추정되는 파일/)).toBeInTheDocument();
    await waitFor(() =>
      expect(monaco.editor.getEditors()[0]?.getOption(monaco.editor.EditorOption.readOnly)).toBe(
        true,
      ),
    );
  });

  test('한 그룹에서 읽기 전용 EUC-KR 탭에서 다른 탭으로 옮기면 에디터를 다시 편집할 수 있다', async () => {
    const { workspace } = await open(
      [
        ['old.txt', eucKr(KOREAN)],
        ['a.py', 'a'],
      ],
      'old.txt',
    );
    await waitFor(() =>
      expect(monaco.editor.getEditors()[0]?.getOption(monaco.editor.EditorOption.readOnly)).toBe(
        true,
      ),
    );
    act(() => workspace.openFile('a.py'));
    await waitFor(() =>
      expect(monaco.editor.getEditors()[0]?.getModel()).toBe(workspace.registry.get('a.py')),
    );
    expect(monaco.editor.getEditors()[0]?.getOption(monaco.editor.EditorOption.readOnly)).toBe(
      false,
    );
  });

  test('확장자와 내용이 다르면 충돌 안내를 보인다', async () => {
    await open([['logo.txt', PNG]], 'logo.txt');
    expect(
      await screen.findByText('확장자(txt)와 달리 내용은 이미지 파일로 보여요.'),
    ).toBeInTheDocument();
  });

  test('Monaco가 큰 파일로 보면 배너를 보이고, 아주 크면 자동완성 안내도 함께 보인다', async () => {
    const context = await renderArea([['big.txt', 'x']], FilePanel);
    await context.workspace.loadFile('big.txt');
    const model = context.workspace.registry.get('big.txt')! as unknown as {
      isTooLargeForTokenization(): boolean;
      isTooLargeForSyncing(): boolean;
    };
    vi.spyOn(model, 'isTooLargeForTokenization').mockReturnValue(true);
    vi.spyOn(model, 'isTooLargeForSyncing').mockReturnValue(true);
    act(() => context.workspace.openFile('big.txt'));
    expect(await screen.findByText(/아주 큰 파일이라/)).toBeInTheDocument();
  });
});

describe('읽기 실패', () => {
  test('그 탭에만 재시도 폴백을 보이고, 재시도가 성공하면 정상으로 연다', async () => {
    const inner = memorySource([['a.py', 'a']]);
    let fail = true;
    const source: FileSource = {
      list: () => inner.list(),
      readHead: (path, bytes) => inner.readHead(path, bytes),
      readAll: async (path) => {
        if (fail) throw new Error('읽기 실패');
        return inner.readAll(path);
      },
    };
    const { workspace } = await renderArea(source, FilePanel);
    act(() => workspace.openFile('a.py'));
    // Monaco도 스크린 리더 알림용 role=alert 요소를 두므로 문구로 찾는다.
    const alert = await screen.findByText('파일을 읽지 못했어요');
    expect(alert).toHaveAttribute('role', 'alert');
    fail = false;
    fireEvent.click(within(panelBody()).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.queryByText('파일을 읽지 못했어요')).toBeNull());
    expect(workspace.registry.get('a.py')?.getValue()).toBe('a');
  });
});
