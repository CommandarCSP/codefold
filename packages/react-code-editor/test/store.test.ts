import { describe, expect, test } from 'vitest';
import { isAtOrUnder, parentOf } from '../src/paths';
import { createEditorStore } from '../src/store';

describe('경로 도우미', () => {
  test('parentOf·isAtOrUnder', () => {
    expect(parentOf('a/b/c.ts')).toBe('a/b');
    expect(parentOf('c.ts')).toBe('');
    expect(isAtOrUnder('a/b', 'a')).toBe(true);
    expect(isAtOrUnder('a', 'a')).toBe(true);
    expect(isAtOrUnder('ab', 'a')).toBe(false);
  });
});

describe('수정 표시', () => {
  test('파일이 고쳐지면 부모 폴더마다 수를 올리고, 원본이 되면 내린다', () => {
    const store = createEditorStore();
    store.getState().setDirty('src/a/x.ts', true);
    store.getState().setDirty('src/y.ts', true);
    expect(store.getState().dirty).toEqual({ 'src/a/x.ts': true, 'src/y.ts': true });
    expect(store.getState().dirtyFolders).toEqual({ src: 2, 'src/a': 1 });
    store.getState().setDirty('src/a/x.ts', false);
    expect(store.getState().dirtyFolders).toEqual({ src: 1 });
    store.getState().setDirty('src/y.ts', false);
    expect(store.getState().dirtyFolders).toEqual({});
  });

  test('같은 값으로 두 번 바꿔도 수가 두 번 오르지 않는다', () => {
    const store = createEditorStore();
    store.getState().setDirty('src/a.ts', true);
    store.getState().setDirty('src/a.ts', true);
    expect(store.getState().dirtyFolders).toEqual({ src: 1 });
  });

  test('다른 경로의 수정 여부가 바뀌어도 이 경로의 선택 값은 그대로다', () => {
    const store = createEditorStore();
    const seen: boolean[] = [];
    store.subscribe((state) => seen.push(state.dirty['b.ts'] === true));
    store.getState().setDirty('a.ts', true);
    expect(seen).toEqual([false]);
  });
});

describe('펼침과 포커스', () => {
  test('처음에는 모두 접혀 있고, toggle·expand·collapse로 바꾼다', () => {
    const store = createEditorStore();
    expect(store.getState().expanded.size).toBe(0);
    store.getState().toggle('src');
    expect(store.getState().expanded.has('src')).toBe(true);
    store.getState().toggle('src');
    expect(store.getState().expanded.has('src')).toBe(false);
    store.getState().expand('lib');
    store.getState().collapse('lib');
    expect(store.getState().expanded.size).toBe(0);
  });

  test('reveal은 그 경로의 부모 폴더를 모두 펼친다', () => {
    const store = createEditorStore();
    store.getState().reveal('a/b/c/file.ts');
    expect([...store.getState().expanded].sort()).toEqual(['a', 'a/b', 'a/b/c']);
  });

  test('새 항목 입력을 시작하면 부모 폴더를 펼친다', () => {
    const store = createEditorStore();
    store.getState().startCreate('src', false);
    expect(store.getState().editing).toEqual({
      mode: 'create',
      parentPath: 'src',
      isDirectory: false,
    });
    expect(store.getState().expanded.has('src')).toBe(true);
    store.getState().stopEditing();
    expect(store.getState().editing).toBeNull();
  });
});

describe('이름 변경·삭제 반영', () => {
  test('폴더 이름을 바꾸면 펼침·포커스·활성·입력 경로를 새 경로로 옮긴다', () => {
    const store = createEditorStore();
    store.getState().expand('d');
    store.getState().expand('d/sub');
    store.getState().setFocused('d/sub/x.ts');
    store.getState().setActive('d/sub/x.ts');
    store.getState().applyRename([
      { from: 'd', to: 'e', isDirectory: true },
      { from: 'd/sub', to: 'e/sub', isDirectory: true },
      { from: 'd/sub/x.ts', to: 'e/sub/x.ts', isDirectory: false },
    ]);
    expect([...store.getState().expanded].sort()).toEqual(['e', 'e/sub']);
    expect(store.getState().focusedPath).toBe('e/sub/x.ts');
    expect(store.getState().activePath).toBe('e/sub/x.ts');
  });

  test('폴더를 지우면 그 아래의 펼침을 지우고, 포커스는 부모로 옮긴다', () => {
    const store = createEditorStore();
    store.getState().expand('src');
    store.getState().expand('src/lib');
    store.getState().setFocused('src/lib/a.ts');
    store.getState().startRename('src/lib/a.ts');
    store.getState().applyDelete('src/lib');
    expect([...store.getState().expanded]).toEqual(['src']);
    expect(store.getState().focusedPath).toBe('src');
    expect(store.getState().editing).toBeNull();
  });

  test('최상위 항목을 지우면 포커스가 없어진다', () => {
    const store = createEditorStore();
    store.getState().setFocused('a.ts');
    store.getState().applyDelete('a.ts');
    expect(store.getState().focusedPath).toBeUndefined();
  });
});
