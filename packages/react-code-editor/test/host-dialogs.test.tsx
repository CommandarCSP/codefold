import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import { describe, expect, test } from 'vitest';
import { FileTreePanel } from '../src/tree/file-tree-panel';
import { createEditorWorkspace, type EditorWorkspace } from '../src/workspace';
import { memorySource, typeInto } from './helpers';

const HostModal = NiceModal.create(() => {
  const modal = useModal();
  return modal.visible ? <div role="dialog" aria-label="앱 확인창" /> : null;
});

function Host({ workspace, showPanel }: { workspace: EditorWorkspace; showPanel: boolean }) {
  return (
    <NiceModal.Provider>{showPanel && <FileTreePanel workspace={workspace} />}</NiceModal.Provider>
  );
}

describe('쓰는 쪽의 nice-modal과 섞이지 않는다 (ADR-0035)', () => {
  test('앱이 띄운 확인창은 에디터가 사라져도 남는다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['a.ts', 'a']]),
      monaco,
    });
    const { rerender } = render(<Host workspace={workspace} showPanel />);
    act(() => void NiceModal.show(HostModal));
    expect(screen.getByRole('dialog', { name: '앱 확인창' })).toBeInTheDocument();
    rerender(<Host workspace={workspace} showPanel={false} />);
    expect(screen.getByRole('dialog', { name: '앱 확인창' })).toBeInTheDocument();
  });

  test('nice-modal Provider가 없어도 에디터의 확인창이 뜬다', async () => {
    const workspace = await createEditorWorkspace({
      source: memorySource([['a.ts', 'a']]),
      monaco,
    });
    await workspace.loadFile('a.ts');
    act(() => typeInto(workspace.registry.get('a.ts')!, '!'));
    render(<FileTreePanel workspace={workspace} />);
    act(() => workspace.store.getState().setFocused('a.ts'));
    const user = userEvent.setup();
    act(() => {
      screen
        .getByRole('tree')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(workspace.fs.getNode('a.ts')).toBeDefined();
  });
});
