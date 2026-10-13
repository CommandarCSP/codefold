import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openZip } from '../src/archive';
import { toDosDateTime } from '../src/dos-time';
import { writeZip } from '../src/writer';
import { fixture } from './helpers';

const utf8 = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

// 결과 ZIP을 이 패키지가 아닌 외부 도구(Info-ZIP unzip)로도 검사한다.
async function unzipTest(blob: Blob): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), 'zip-archive-')), 'out.zip');
  writeFileSync(path, new Uint8Array(await blob.arrayBuffer()));
  return execFileSync('unzip', ['-t', path], { encoding: 'utf8' });
}

describe('toDosDateTime', () => {
  test('로컬 시각을 DOS 날짜·시간으로 바꾼다', () => {
    expect(toDosDateTime(new Date(2026, 8, 27, 15, 30, 44))).toEqual({
      time: (15 << 11) | (30 << 5) | 22,
      date: ((2026 - 1980) << 9) | (9 << 5) | 27,
    });
  });
  test('1980년 이전은 1980-01-01로 맞춘다', () => {
    expect(toDosDateTime(new Date(1970, 0, 1))).toEqual({ time: 0, date: (1 << 5) | 1 });
  });
});

describe('writeZip', () => {
  test('새 파일과 폴더를 쓰고 다시 읽는다', async () => {
    const blob = await writeZip([
      { type: 'directory', path: 'src' },
      { type: 'file', path: 'src/main.py', data: utf8('print("안녕")\n'.repeat(50)) },
      { type: 'file', path: '한글.txt', data: utf8('내용') },
      { type: 'file', path: 'empty.txt', data: new Uint8Array() },
    ]);
    const zip = await openZip(blob);
    expect(zip.entries.map((e) => [e.path, e.isDirectory])).toEqual([
      ['src', true],
      ['src/main.py', false],
      ['한글.txt', false],
      ['empty.txt', false],
    ]);
    expect(text(await zip.readAll('src/main.py'))).toBe('print("안녕")\n'.repeat(50));
    expect(zip.entries.find((e) => e.path === 'src/main.py')?.method).toBe(8);
    expect(zip.entries.find((e) => e.path === '한글.txt')?.nameEncoding).toBe('utf-8');
    expect(await unzipTest(blob)).toContain('No errors detected');
  });

  test('압축해도 줄지 않는 내용은 Stored로 쓴다', async () => {
    const random = crypto.getRandomValues(new Uint8Array(4096));
    const zip = await openZip(await writeZip([{ type: 'file', path: 'r.bin', data: random }]));
    expect(zip.entries[0]).toMatchObject({ method: 0, size: 4096, compressedSize: 4096 });
    expect([...(await zip.readAll('r.bin'))]).toEqual([...random]);
  });

  test('원본 복사 항목은 압축 바이트가 원본과 같고, 새 이름으로도 쓸 수 있다', async () => {
    const source = await openZip(fixture('deflate.zip'));
    const raw = await source.readRaw('project/data/repeat.txt');
    const blob = await writeZip([
      { type: 'raw', path: 'project/data/repeat.txt', raw },
      { type: 'raw', path: 'renamed.txt', raw },
      { type: 'file', path: 'project/src/main.py', data: utf8('print("changed")\n') },
    ]);
    const out = await openZip(blob);
    const copied = await out.readRaw('renamed.txt');
    expect(new Uint8Array(await copied.data.arrayBuffer())).toEqual(
      new Uint8Array(await raw.data.arrayBuffer()),
    );
    expect(copied.entry).toMatchObject({ crc32: raw.entry.crc32, method: 8, size: 1200 });
    expect(text(await out.readAll('renamed.txt'))).toBe('hello\n'.repeat(200));
    expect(text(await out.readAll('project/src/main.py'))).toBe('print("changed")\n');
    expect(await unzipTest(blob)).toContain('No errors detected');
  });

  test('데이터 기술자를 쓴 원본(macOS ditto)을 복사해도 결과가 깨지지 않는다', async () => {
    const source = await openZip(fixture('macos-ditto.zip'));
    const raw = await source.readRaw('finder/한글폴더/노트.txt');
    const blob = await writeZip([{ type: 'raw', path: 'finder/한글폴더/노트.txt', raw }]);
    const out = await openZip(blob);
    expect(out.entries[0]!.flags & 0x8).toBe(0);
    expect(text(await out.readAll('finder/한글폴더/노트.txt'))).toBe('안녕\n');
    expect(await unzipTest(blob)).toContain('No errors detected');
  });

  test('원본 파일의 실행 권한을 이어받을 수 있다', async () => {
    const source = await openZip(fixture('deflate.zip'));
    const original = source.entries.find((e) => e.path === 'project/src/main.py')!;
    expect((original.externalAttributes >>> 16) & 0o777).toBe(0o755);
    const out = await openZip(
      await writeZip([
        {
          type: 'file',
          path: 'project/src/main.py',
          data: utf8('print(1)\n'),
          attributesFrom: original,
        },
        { type: 'file', path: 'plain.txt', data: utf8('x') },
      ]),
    );
    expect((out.entries[0]!.externalAttributes >>> 16) & 0o777).toBe(0o755);
    expect((out.entries[1]!.externalAttributes >>> 16) & 0o777).toBe(0o644);
  });

  test('수정 시각을 적는다', async () => {
    const when = new Date(2026, 8, 27, 15, 30, 44);
    const out = await openZip(
      await writeZip([{ type: 'file', path: 'a.txt', data: utf8('a'), modified: when }]),
    );
    const { time, date } = toDosDateTime(when);
    expect(out.entries[0]).toMatchObject({ dosTime: time, dosDate: date });
  });

  test('같은 경로가 두 번 나오면 openZip은 뒤 항목을 읽는다', async () => {
    const zip = await openZip(
      await writeZip([
        { type: 'file', path: 'a.txt', data: utf8('first') },
        { type: 'file', path: 'a.txt', data: utf8('second') },
      ]),
    );
    expect(zip.entries.length).toBe(2);
    expect(text(await zip.readAll('a.txt'))).toBe('second');
  });
});
