import { writeZip } from '@codefold/zip-archive';

export const bytes = (text: string) => new TextEncoder().encode(text);

/** 실행 권한이 있는 Unix 파일 속성(0755, 만든 운영체제 3 = Unix). */
export const EXECUTABLE = {
  externalAttributes: (0o100755 << 16) >>> 0,
  versionMadeBy: (3 << 8) | 20,
} as const;

/** src/a.txt(한글), 실행 권한이 있는 run.sh, 빈 폴더 logs가 든 ZIP. */
export function sampleZip(): Promise<Blob> {
  return writeZip([
    { type: 'file', path: 'src/a.txt', data: bytes('에이') },
    {
      type: 'file',
      path: 'run.sh',
      data: bytes('#!/bin/sh\necho hi\n'),
      attributesFrom: EXECUTABLE,
    },
    { type: 'directory', path: 'logs' },
  ]);
}
