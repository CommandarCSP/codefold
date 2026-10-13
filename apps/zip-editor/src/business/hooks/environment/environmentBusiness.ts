// apps/zip-editor/src/business/hooks/environment/environmentBusiness.ts
export type RequiredFeature =
  'compression-streams' | 'web-locks' | 'crypto-subtle' | 'indexeddb' | 'web-worker';

export type EnvironmentReport =
  | { readonly kind: 'ok' }
  | { readonly kind: 'insecure' }
  | { readonly kind: 'unsupported'; readonly missing: readonly RequiredFeature[] };

/** 검사에 쓰는 전역의 모양. 실제는 globalThis, 테스트는 가짜 객체다. */
export interface EnvironmentScope {
  readonly isSecureContext?: boolean;
  readonly DecompressionStream?: new (format: CompressionFormat) => unknown;
  readonly CompressionStream?: new (format: CompressionFormat) => unknown;
  readonly navigator?: { readonly locks?: unknown };
  readonly crypto?: { readonly subtle?: unknown };
  readonly indexedDB?: unknown;
  readonly Worker?: unknown;
}

function supportsDeflateRaw(scope: EnvironmentScope): boolean {
  const { DecompressionStream: Decompress, CompressionStream: Compress } = scope;
  if (typeof Decompress !== 'function' || typeof Compress !== 'function') return false;
  try {
    new Decompress('deflate-raw');
    new Compress('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

/**
 * 앱을 열 수 있는 브라우저인가(ADR-0030). 버전이 아니라 기능으로 판단한다.
 * - 2026-09: `crypto.subtle`·Web Locks·`storage.persist()`는 보안 컨텍스트에서만 있다. 그래서 보안 연결을 먼저 본다.
 * - 2026-09: 없는 기능을 모두 모아 결과에 담는다. 안내 화면은 이 목록을 보이지 않는다.
 */
export function checkEnvironment(scope: EnvironmentScope): EnvironmentReport {
  if (scope.isSecureContext !== true) return { kind: 'insecure' };
  const missing: RequiredFeature[] = [];
  if (!supportsDeflateRaw(scope)) missing.push('compression-streams');
  if (!scope.navigator?.locks) missing.push('web-locks');
  if (!scope.crypto?.subtle) missing.push('crypto-subtle');
  if (!scope.indexedDB) missing.push('indexeddb');
  if (typeof scope.Worker !== 'function') missing.push('web-worker');
  return missing.length > 0 ? { kind: 'unsupported', missing } : { kind: 'ok' };
}
