import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blobSource } from '../src/bytes';
import type { ByteSource } from '../src/types';

const ZIPS = join(import.meta.dirname, 'fixtures', 'zips');

export const fixtureBytes = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(join(ZIPS, name)));

export const fixture = (name: string): Blob => new Blob([fixtureBytes(name)]);

/** 읽은 범위를 기록하는 ByteSource. 목록을 읽을 때 데이터 영역을 건드리지 않는지 확인한다. */
export function recordingSource(blob: Blob): {
  source: ByteSource;
  ranges: Array<[number, number]>;
} {
  const inner = blobSource(blob);
  const ranges: Array<[number, number]> = [];
  return {
    ranges,
    source: {
      size: inner.size,
      read: (start, end) => {
        ranges.push([start, end]);
        return inner.read(start, end);
      },
      slice: (start, end) => {
        ranges.push([start, end]);
        return inner.slice(start, end);
      },
    },
  };
}

/** 주석 없는 ZIP에서 `path` 항목의 Central Directory 기록이 시작하는 위치. 손상 테스트에서 칸을 고칠 때 쓴다. */
export function centralRecordAt(bytes: Uint8Array, path: string): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  for (let at = v.getUint32(end + 16, true); at < end;) {
    const nameLength = v.getUint16(at + 28, true);
    if (new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)) === path) return at;
    at += 46 + nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  throw new Error(`Central Directory에 없는 경로: ${path}`);
}
