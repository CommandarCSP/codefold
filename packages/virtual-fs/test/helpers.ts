import type { FileSource } from '../src/types';

/**
 * 메모리 파일 출처. `null`은 폴더다. 같은 경로를 여러 번 넣을 수 있다(ZIP처럼 뒤 항목이 이긴다).
 * `reads`에 읽은 원본 경로가 순서대로 쌓인다.
 */
export function memorySource(
  items: ReadonlyArray<readonly [path: string, content: string | null]>,
): FileSource & { readonly reads: string[] } {
  const encoder = new TextEncoder();
  const bytes = new Map<string, Uint8Array>();
  for (const [path, content] of items)
    if (content !== null) bytes.set(path, encoder.encode(content));
  const reads: string[] = [];
  const read = (path: string) => {
    reads.push(path);
    const data = bytes.get(path);
    if (!data) throw new Error(`memorySource에 없는 경로: ${path}`);
    return data;
  };
  return {
    reads,
    list: async () =>
      items.map(([path, content]) => ({
        path,
        isDirectory: content === null,
        size: content === null ? 0 : encoder.encode(content).length,
      })),
    readHead: async (path, n) => read(path).slice(0, n),
    readAll: async (path) => read(path).slice(),
  };
}

/** 폴더의 자식 이름만 뽑는다. */
export const names = (nodes: readonly { name: string }[]) => nodes.map((n) => n.name);

/**
 * 걸린 시간을 기록하고, 목표를 넘으면 경고만 남긴다. 시간 지표는 CI 러너 속도에 따라 들쭉날쭉하므로
 * 실패 조건으로 두지 않는다(ADR-0027). GitHub Actions에서는 경고 주석으로도 남긴다.
 */
export function reportTiming(label: string, elapsedMs: number, budgetMs: number): void {
  const message = `${label}: ${elapsedMs.toFixed(1)}ms (목표 ${budgetMs}ms)`;
  if (elapsedMs < budgetMs) {
    console.info(message);
    return;
  }
  console.warn(`목표 초과 — ${message}`);
  // 이 패키지는 Node 타입을 쓰지 않으므로 process를 globalThis에서 꺼낸다(테스트는 Node에서 돈다).
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env;
  if (env?.GITHUB_ACTIONS) console.log(`::warning title=성능 목표 초과::${message}`);
}
