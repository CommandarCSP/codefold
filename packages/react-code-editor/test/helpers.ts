import type { TextModel } from '@codefold/monaco-binding';
import type { Disposable, FileSource } from '@codefold/virtual-fs';
import type { EditorAreaPort } from '../src/types';

type Content = string | Uint8Array | null;

/**
 * 메모리 파일 출처. `null`은 폴더, 문자열은 UTF-8 텍스트, `Uint8Array`는 그대로의 바이트다.
 * `reads`에 읽은 원본 경로가 순서대로 쌓인다.
 */
export function memorySource(
  items: ReadonlyArray<readonly [path: string, content: Content]>,
): FileSource & { readonly reads: string[] } {
  const bytes = new Map<string, Uint8Array>();
  for (const [path, content] of items) {
    if (content !== null)
      bytes.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }
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
        size: content === null ? 0 : (bytes.get(path)?.length ?? 0),
      })),
    readHead: async (path, n) => read(path).slice(0, n),
    readAll: async (path) => read(path).slice(),
  };
}

/** 가짜 에디터 영역. 부른 것을 기록하고, 활성 탭 변경을 흉내 낸다. */
export function fakeArea() {
  const opened: string[] = [];
  const closed: string[] = [];
  const renamed: Array<[string, string]> = [];
  let focusCount = 0;
  const listeners = new Set<(path: string | undefined) => void>();
  const area: EditorAreaPort = {
    open: (path) => opened.push(path),
    close: (path) => closed.push(path),
    rename: (from, to) => renamed.push([from, to]),
    focusEditor: () => {
      focusCount += 1;
    },
    onActiveChange: (listener): Disposable => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
  return {
    area,
    opened,
    closed,
    renamed,
    focusCount: () => focusCount,
    emitActive: (path: string | undefined) => {
      for (const listener of listeners) listener(path);
    },
  };
}

/** model 끝에 글자를 붙인다. 한 번 부르면 undo 한 단계가 된다. */
export function typeInto(model: TextModel, text: string): void {
  model.pushStackElement();
  model.pushEditOperations(
    [],
    [{ range: model.getFullModelRange().collapseToEnd(), text }],
    () => null,
  );
  model.pushStackElement();
}

// EUC-KR 인코더는 브라우저에 없어 테스트에 필요한 글자만 표로 둔다.
const EUC_KR: Readonly<Record<string, readonly [number, number]>> = {
  안: [0xbe, 0xc8],
  녕: [0xb3, 0xe7],
  하: [0xc7, 0xcf],
  세: [0xbc, 0xbc],
  요: [0xbf, 0xe4],
};

/** 표에 있는 한글과 ASCII만 EUC-KR 바이트로 바꾼다. */
export function eucKr(text: string): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  for (const char of text) {
    const pair = EUC_KR[char];
    if (pair) out.push(...pair);
    else out.push(char.charCodeAt(0));
  }
  return new Uint8Array(out);
}
