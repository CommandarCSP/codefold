import { describe, expect, test } from 'vitest';
import { checkName, compareNodes, nameKey } from '../src/names';

describe('checkName', () => {
  test.each(['', ' ', '\t'])('%j는 빈 이름', (name) => {
    expect(checkName(name)).toBe('empty');
  });
  test.each(['.', '..'])('%s는 예약된 이름', (name) => {
    expect(checkName(name)).toBe('reserved');
  });
  test.each(['a/b', 'a\\b', 'a\u0000b', 'a\nb', 'a\u001fb', 'a\u007fb'])(
    '%j는 쓸 수 없는 문자가 있다',
    (name) => {
      expect(checkName(name)).toBe('invalid-character');
    },
  );
  test.each(['main.py', '.gitignore', '...', '한글 이름.txt', ' 앞 공백', 'a.b.c'])(
    '%j는 쓸 수 있다',
    (name) => {
      expect(checkName(name)).toBeUndefined();
    },
  );
});

describe('nameKey', () => {
  test('대소문자와 NFC·NFD 차이를 무시한다', () => {
    expect(nameKey('README.md')).toBe(nameKey('readme.md'));
    expect(nameKey('한글.txt'.normalize('NFD'))).toBe(nameKey('한글.txt'));
    expect(nameKey('a.txt')).not.toBe(nameKey('b.txt'));
  });
});

describe('compareNodes', () => {
  const sort = (items: Array<[string, boolean]>) =>
    items
      .map(([name, isDirectory]) => ({ name, isDirectory }))
      .sort(compareNodes)
      .map((n) => n.name);

  test('폴더가 먼저, 파일이 나중', () => {
    expect(
      sort([
        ['b.txt', false],
        ['z', true],
        ['a.txt', false],
        ['a', true],
      ]),
    ).toEqual(['a', 'z', 'a.txt', 'b.txt']);
  });

  test('숫자는 자연 정렬', () => {
    expect(
      sort([
        ['file10.txt', false],
        ['file2.txt', false],
        ['file1.txt', false],
      ]),
    ).toEqual(['file1.txt', 'file2.txt', 'file10.txt']);
  });

  test('대소문자만 다른 이름도 늘 같은 순서로 나온다', () => {
    const once = sort([
      ['b', false],
      ['B', false],
      ['a', false],
    ]);
    const again = sort([
      ['a', false],
      ['B', false],
      ['b', false],
    ]);
    expect(once).toEqual(again);
    expect(once[0]).toBe('a');
  });

  test('한글 이름도 가나다순', () => {
    expect(
      sort([
        ['하나.txt', false],
        ['가방.txt', false],
        ['나무.txt', false],
      ]),
    ).toEqual(['가방.txt', '나무.txt', '하나.txt']);
  });
});
