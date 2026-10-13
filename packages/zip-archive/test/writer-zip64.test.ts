import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openZip } from '../src/archive';
import { centralHeader, writeZip } from '../src/writer';

describe('ZIP64 쓰기', () => {
  test('항목이 65,535개를 넘으면 ZIP64 EOCD를 쓰고, 다시 읽을 수 있다', async () => {
    const items = Array.from({ length: 70_000 }, (_, i) => ({
      type: 'file' as const,
      path: `f/${i}.txt`,
      data: new Uint8Array(),
    }));
    const blob = await writeZip(items);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const tail = bytes.subarray(bytes.length - 22 - 20 - 56);
    expect(new DataView(tail.buffer, tail.byteOffset).getUint32(0, true)).toBe(0x06064b50);
    const zip = await openZip(blob);
    expect(zip.entries.length).toBe(70_000);
    expect(zip.entries.at(-1)?.path).toBe('f/69999.txt');

    const path = join(mkdtempSync(join(tmpdir(), 'zip64-')), 'many.zip');
    writeFileSync(path, bytes);
    expect(execFileSync('unzip', ['-tq', path], { encoding: 'utf8' })).toContain(
      'No errors detected',
    );
  }, 60_000);

  test('4GB를 넘는 크기와 위치는 확장 필드에 적는다', () => {
    const header = centralHeader(
      {
        name: new TextEncoder().encode('big.bin'),
        flags: 0x800,
        method: 0,
        time: 0,
        date: 0,
        crc: 0,
        compressedSize: 5_000_000_000,
        size: 5_000_000_000,
        versionMadeBy: 0x032d,
        externalAttributes: 0,
        data: new Uint8Array(),
      },
      6_000_000_000,
    );
    const v = new DataView(header.buffer);
    expect(v.getUint32(20, true)).toBe(0xffffffff);
    expect(v.getUint32(24, true)).toBe(0xffffffff);
    expect(v.getUint32(42, true)).toBe(0xffffffff);
    const extraAt = 46 + 7;
    expect(v.getUint16(extraAt, true)).toBe(0x0001);
    expect(v.getUint16(extraAt + 2, true)).toBe(24);
    expect(v.getBigUint64(extraAt + 4, true)).toBe(5_000_000_000n);
    expect(v.getBigUint64(extraAt + 12, true)).toBe(5_000_000_000n);
    expect(v.getBigUint64(extraAt + 20, true)).toBe(6_000_000_000n);
  });
});
