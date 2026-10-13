// apps/zip-editor/src/business/hooks/autosave/__tests__/autosaveBusiness.test.ts
import { describe, expect, test } from 'vitest';
import { affectedPaths, splitContents } from '../autosaveBusiness';

describe('자동 저장 규칙', () => {
  test('삭제: 그 경로와 그 아래의 저장본만 고른다', () => {
    const saved = new Set(['src/a.ts', 'src/b/c.ts', 'srcx.ts', 'README.md']);
    expect(affectedPaths({ type: 'delete', path: 'src' }, saved, [])).toEqual([
      'src/a.ts',
      'src/b/c.ts',
    ]);
    expect(affectedPaths({ type: 'delete', path: 'README.md' }, saved, [])).toEqual(['README.md']);
  });

  test('이름 변경: 옛 경로 아래 저장본과 새 경로 아래 고친 파일을 고른다', () => {
    const saved = new Set(['old/a.ts', 'other.ts']);
    const dirty = ['new/a.ts', 'other.ts'];
    expect(affectedPaths({ type: 'rename', from: 'old', to: 'new' }, saved, dirty)).toEqual([
      'old/a.ts',
      'new/a.ts',
    ]);
  });

  test('추가: 새 경로 아래 고친 파일만 고른다', () => {
    expect(
      affectedPaths({ type: 'add', path: 'n.ts', isDirectory: false }, new Set(), ['n.ts', 'x.ts']),
    ).toEqual(['n.ts']);
  });

  test('읽은 내용에 있으면 넣고, 없으면(원본과 같아짐·삭제) 지운다', () => {
    expect(splitContents(['a', 'b', 'c'], { a: '하나', c: '' })).toEqual({
      put: { a: '하나', c: '' },
      remove: ['b'],
    });
  });
});
