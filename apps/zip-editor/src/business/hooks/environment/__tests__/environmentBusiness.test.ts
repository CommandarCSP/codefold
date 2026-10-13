// apps/zip-editor/src/business/hooks/environment/__tests__/environmentBusiness.test.ts
import { describe, expect, test } from 'vitest';
import { checkEnvironment, type EnvironmentScope } from '../environmentBusiness';

class Stream {
  constructor(format: string) {
    if (format !== 'deflate-raw') throw new TypeError('모르는 형식');
  }
}
class OldStream {
  constructor(format: string) {
    if (format !== 'gzip') throw new TypeError('deflate-raw 없음');
  }
}

const full: EnvironmentScope = {
  isSecureContext: true,
  DecompressionStream: Stream,
  CompressionStream: Stream,
  navigator: { locks: {} },
  crypto: { subtle: {} },
  indexedDB: {},
  Worker: class {},
};

describe('브라우저 기능 검사', () => {
  test('보안 컨텍스트이고 기능이 모두 있으면 ok', () => {
    expect(checkEnvironment(full)).toEqual({ kind: 'ok' });
  });

  test('보안 컨텍스트가 아니면 기능과 상관없이 insecure다', () => {
    expect(checkEnvironment({ ...full, isSecureContext: false })).toEqual({ kind: 'insecure' });
    expect(checkEnvironment({ ...full, isSecureContext: undefined })).toEqual({ kind: 'insecure' });
  });

  test('없는 기능을 모두 모아 알린다', () => {
    expect(
      checkEnvironment({
        ...full,
        navigator: {},
        crypto: {},
        indexedDB: undefined,
        Worker: undefined,
      }),
    ).toEqual({
      kind: 'unsupported',
      missing: ['web-locks', 'crypto-subtle', 'indexeddb', 'web-worker'],
    });
  });

  test('압축 스트림이 있어도 deflate-raw를 받지 않으면 없는 것이다', () => {
    expect(checkEnvironment({ ...full, DecompressionStream: OldStream })).toEqual({
      kind: 'unsupported',
      missing: ['compression-streams'],
    });
    expect(checkEnvironment({ ...full, CompressionStream: undefined })).toMatchObject({
      missing: ['compression-streams'],
    });
  });
});
