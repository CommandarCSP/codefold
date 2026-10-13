import { describe, expect, test } from 'vitest';
import { blobSource } from '../src/bytes';
import { readCentralDirectory } from '../src/central';
import { CorruptZipError, EncryptedZipError, NotZipError, SplitZipError } from '../src/errors';
import { fixture, fixtureBytes } from './helpers';

const read = (name: string) => readCentralDirectory(blobSource(fixture(name)));
const paths = async (name: string) => (await read(name)).map((e) => e.path);

describe('readCentralDirectory', () => {
  test('Stored·Deflate ZIP의 항목과 폴더를 읽는다', async () => {
    for (const name of ['stored.zip', 'deflate.zip']) {
      const entries = await read(name);
      expect(entries.map((e) => e.path)).toEqual(
        expect.arrayContaining([
          'project',
          'project/src',
          'project/src/main.py',
          'project/data/repeat.txt',
        ]),
      );
      expect(entries.find((e) => e.path === 'project')).toMatchObject({
        isDirectory: true,
        size: 0,
      });
      expect(entries.find((e) => e.path === 'project/src/main.py')).toMatchObject({
        isDirectory: false,
        size: 15,
      });
    }
    expect(
      (await read('stored.zip')).find((e) => e.path === 'project/data/repeat.txt')?.method,
    ).toBe(0);
    expect(
      (await read('deflate.zip')).find((e) => e.path === 'project/data/repeat.txt')?.method,
    ).toBe(8);
  });

  test('폴더 항목이 없는 ZIP도 파일 항목을 읽는다', async () => {
    expect(await paths('no-dir-entries.zip')).not.toContain('project');
    expect(await paths('no-dir-entries.zip')).toContain('project/src/main.py');
  });

  test('ZIP64 기록이 있는 작은 ZIP을 읽는다', async () => {
    const entries = await read('zip64-small.zip');
    expect(entries.find((e) => e.path === 'project/data/repeat.txt')).toMatchObject({ size: 1200 });
  });

  test('이름 인코딩을 샘플마다 알맞게 읽는다', async () => {
    expect(await paths('utf8-flag.zip')).toContain('한글/파일.txt');
    expect(await paths('macos-ditto.zip')).toContain('finder/한글폴더/노트.txt');
    expect(await paths('macos-ditto.zip')).toContain('__MACOSX/finder/한글폴더/._노트.txt');
    expect(await paths('cp949-names.zip')).toEqual(['한글/문서.txt']);
    expect(await paths('cp437-names.zip')).toEqual(['café.txt']);
    expect(await paths('unicode-path-extra.zip')).toEqual(['보고서.txt']);
    expect(await paths('nfd-names.zip')).toEqual(['한글.txt'.normalize('NFC')]);
  });

  test('DOS에서 만든 항목의 \\는 /로 바꾼다', async () => {
    expect(await paths('backslash-dos.zip')).toEqual(['dir/file.txt']);
  });

  test('데이터 기술자를 쓴 항목도 Central Directory의 크기를 가진다', async () => {
    const note = (await read('macos-ditto.zip')).find((e) => e.path === 'finder/한글폴더/노트.txt');
    expect(note).toMatchObject({ size: 7 });
    expect(note!.flags & 0x8).toBe(0x8);
  });

  test('암호화 ZIP은 EncryptedZipError', async () => {
    await expect(read('encrypted.zip')).rejects.toBeInstanceOf(EncryptedZipError);
  });

  test('분할 ZIP은 SplitZipError', async () => {
    await expect(read('split.zip')).rejects.toBeInstanceOf(SplitZipError);
  });

  test('ZIP이 아니면 NotZipError (내용으로 판단)', async () => {
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Uint8Array(40),
    ]);
    await expect(readCentralDirectory(blobSource(new Blob([png])))).rejects.toBeInstanceOf(
      NotZipError,
    );
    await expect(readCentralDirectory(blobSource(new Blob([])))).rejects.toBeInstanceOf(
      NotZipError,
    );
  });

  test('Central Directory 위치가 파일 밖을 가리키면 CorruptZipError', async () => {
    const bytes = fixtureBytes('deflate.zip');
    const eocd = bytes.length - 22;
    new DataView(bytes.buffer).setUint32(eocd + 16, bytes.length + 100, true);
    await expect(readCentralDirectory(blobSource(new Blob([bytes])))).rejects.toBeInstanceOf(
      CorruptZipError,
    );
  });

  test('Central Directory 서명이 깨지면 CorruptZipError', async () => {
    const bytes = fixtureBytes('deflate.zip');
    const cdOffset = new DataView(bytes.buffer).getUint32(bytes.length - 22 + 16, true);
    bytes[cdOffset] = 0;
    await expect(readCentralDirectory(blobSource(new Blob([bytes])))).rejects.toBeInstanceOf(
      CorruptZipError,
    );
  });

  test('주석 안의 가짜 EOCD 서명을 EOCD로 오해하지 않는다', async () => {
    const original = fixtureBytes('deflate.zip');
    const fake = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Uint8Array(18)]);
    const comment = new Uint8Array([...fake, 0x21]);
    const bytes = new Uint8Array(original.length + comment.length);
    bytes.set(original);
    bytes.set(comment, original.length);
    new DataView(bytes.buffer).setUint16(original.length - 2, comment.length, true);
    expect((await readCentralDirectory(blobSource(new Blob([bytes])))).length).toBe(
      (await read('deflate.zip')).length,
    );
  });

  test('끝에 쓰레기 바이트가 붙은 ZIP도 연다', async () => {
    const original = fixtureBytes('deflate.zip');
    const bytes = new Uint8Array(original.length + 5);
    bytes.set(original);
    bytes.set([1, 2, 3, 4, 5], original.length);
    expect((await readCentralDirectory(blobSource(new Blob([bytes])))).length).toBe(
      (await read('deflate.zip')).length,
    );
  });
});
