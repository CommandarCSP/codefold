import { describe, expect, test } from 'vitest';
import * as api from '../src/index';
import { memorySource } from './helpers';

describe('공개 API', () => {
  test('함수와 오류 class만 값으로 내보낸다', () => {
    expect(Object.keys(api).sort()).toEqual([
      'InvalidNameError',
      'NotADirectoryError',
      'NotAFileError',
      'PathNotFoundError',
      'ReplayError',
      'VirtualFsError',
      'createVirtualFs',
    ]);
  });

  test('메서드를 떼어 콜백으로 넘겨도 동작한다 (ADR-0017)', async () => {
    const fs = await api.createVirtualFs(memorySource([['a.txt', 'a']]));
    const { add, children } = fs;
    add('', 'b.txt', false);
    expect(children('').map((n) => n.name)).toEqual(['a.txt', 'b.txt']);
  });
});
