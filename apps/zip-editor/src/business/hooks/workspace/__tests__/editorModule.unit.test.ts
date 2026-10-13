// apps/zip-editor/src/business/hooks/workspace/__tests__/editorModule.unit.test.ts
import { describe, expect, test, vi } from 'vitest';
import { loadEditorModule, type EditorLoader, type EditorModule } from '../editorModule';

const module: EditorModule = { EditorHost: () => null };

describe('에디터 청크 불러오기', () => {
  test('같은 loader는 한 번만 불러오고 같은 Promise를 돌려준다(미리 불러오기와 그리기가 나눠 쓴다)', async () => {
    const loader = vi.fn<EditorLoader>(async () => module);
    const first = loadEditorModule(loader);
    expect(loadEditorModule(loader)).toBe(first);
    await expect(first).resolves.toBe(module);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test('실패하면 기억을 지워, 다음 호출에서 다시 불러온다(에러 경계의 다시 시도)', async () => {
    const loader = vi
      .fn<EditorLoader>()
      .mockRejectedValueOnce(new Error('청크를 받지 못함'))
      .mockResolvedValueOnce(module);
    await expect(loadEditorModule(loader)).rejects.toThrow('청크를 받지 못함');
    await Promise.resolve();
    await expect(loadEditorModule(loader)).resolves.toBe(module);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
