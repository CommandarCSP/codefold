import { readFile } from 'node:fs/promises';

/**
 * 받은 ZIP을 `@codefold/zip-archive`의 openZip으로 읽는다(원장 "정한 것" 2).
 *
 * 패키지 이름으로 import하면 안 된다. exports가 `source` 조건일 때만 src를 가리키고 그 밖에는 빌드 전에 없는
 * dist를 가리키는데, Playwright의 로더는 `source` 조건을 쓰지 않는다. 그래서 src/index.ts를 파일 경로로 불러온다
 * (Playwright 로더가 TS와 확장자 없는 상대 import를 푼다). 경로를 변수로 넘기는 것은 타입 검사 때문이다.
 * e2e는 nodenext로 검사하는데, src의 확장자 없는 상대 import를 따라가면 그 파일들에서 오류가 난다.
 * 테스트가 쓰는 모양만 아래에 적는다.
 */
const ZIP_ARCHIVE_SOURCE = new URL('../../../../packages/zip-archive/src/index.ts', import.meta.url)
  .href;

interface ArchiveEntry {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly size: number;
}

interface ZipArchiveModule {
  openZip(input: Blob): Promise<{
    readonly entries: readonly ArchiveEntry[];
    readAll(path: string): Promise<Uint8Array>;
  }>;
}

export interface ReadZip {
  /** 모든 항목의 경로. 폴더도 끝의 `/` 없이 들어 있다. */
  readonly paths: readonly string[];
  readonly entries: readonly ArchiveEntry[];
  bytes(path: string): Promise<Uint8Array>;
  text(path: string): Promise<string>;
}

export async function readZipFile(file: string): Promise<ReadZip> {
  const { openZip } = (await import(ZIP_ARCHIVE_SOURCE)) as ZipArchiveModule;
  const archive = await openZip(new Blob([new Uint8Array(await readFile(file))]));
  return {
    paths: archive.entries.map((entry) => entry.path),
    entries: archive.entries,
    bytes: (path) => archive.readAll(path),
    text: async (path) =>
      new TextDecoder('utf-8', { fatal: true }).decode(await archive.readAll(path)),
  };
}
