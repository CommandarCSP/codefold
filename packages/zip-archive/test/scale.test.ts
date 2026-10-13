import { describe, expect, test } from 'vitest';
import { NotZipError, openZip, writeZip } from '../src/index';
import { recordingSource } from './helpers';

describe('1만 개 항목', () => {
  test('목록은 파일 끝과 Central Directory만 읽는다', async () => {
    const items = Array.from({ length: 10_000 }, (_, i) => ({
      type: 'file' as const,
      path: `src/module-${i}/index.ts`,
      data: new TextEncoder().encode(`export const n = ${i};\n`),
    }));
    const blob = await writeZip(items);
    const { source, ranges } = recordingSource(blob);
    const started = performance.now();
    const zip = await openZip(source);
    const elapsed = performance.now() - started;
    expect(zip.entries.length).toBe(10_000);
    const lastLocalHeader = Math.max(...zip.entries.map((e) => e.localHeaderOffset));
    expect(ranges.every(([start]) => start > lastLocalHeader)).toBe(true);
    console.info(`1만 개 항목 목록 읽기: ${elapsed.toFixed(1)}ms`);
  }, 60_000);

  test('공개 API에서 ZIP 아님을 구분한다', async () => {
    await expect(openZip(new Blob(['not a zip']))).rejects.toBeInstanceOf(NotZipError);
  });
});
