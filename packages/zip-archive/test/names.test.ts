import { describe, expect, test } from 'vitest';
import { crc32 } from '../src/crc32';
import { decodeName, parseExtraFields } from '../src/names';

const utf8 = (s: string) => new TextEncoder().encode(s);
const NO_EXTRA = new Map<number, Uint8Array>();

describe('decodeName', () => {
  test('UTF-8 플래그가 있으면 UTF-8', () => {
    expect(decodeName(utf8('한글/파일.txt'), true, NO_EXTRA)).toEqual({
      name: '한글/파일.txt',
      encoding: 'utf-8',
    });
  });

  test('플래그가 없어도 올바른 UTF-8이면 UTF-8 (macOS ditto)', () => {
    expect(decodeName(utf8('노트.txt'), false, NO_EXTRA)).toEqual({
      name: '노트.txt',
      encoding: 'utf-8',
    });
  });

  test('NFD 한글 이름은 NFC로 합친다', () => {
    const nfd = utf8('한글.txt'.normalize('NFD'));
    const { name } = decodeName(nfd, false, NO_EXTRA);
    expect(name).toBe('한글.txt'.normalize('NFC'));
    expect(name.length).toBe(6);
  });

  test('UTF-8이 아니면 CP949 (한국어 Windows 탐색기)', () => {
    const cp949 = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb, 0x2e, 0x74, 0x78, 0x74]); // "한글.txt"
    expect(decodeName(cp949, false, NO_EXTRA)).toEqual({ name: '한글.txt', encoding: 'cp949' });
  });

  test('UTF-8도 CP949도 아니면 CP437', () => {
    const cp437 = new Uint8Array([0x63, 0x61, 0x66, 0x82, 0x2e, 0x74, 0x78, 0x74]); // "café.txt"
    expect(decodeName(cp437, false, NO_EXTRA)).toEqual({ name: 'café.txt', encoding: 'cp437' });
  });

  test('유니코드 경로 확장 필드(0x7075)가 이름과 맞으면 그 UTF-8 이름을 쓴다', () => {
    const raw = new Uint8Array([0xba, 0xb8, 0xb0, 0xed]); // "보고"의 CP949
    const body = new Uint8Array([1, 0, 0, 0, 0, ...utf8('보고서')]);
    new DataView(body.buffer).setUint32(1, crc32(raw), true);
    expect(decodeName(raw, false, new Map([[0x7075, body]]))).toEqual({
      name: '보고서',
      encoding: 'utf-8',
    });
  });

  test('0x7075의 CRC가 이름과 다르면 무시한다 (이름을 나중에 바꾼 경우)', () => {
    const raw = utf8('new.txt');
    const body = new Uint8Array([1, 0, 0, 0, 0, ...utf8('old.txt')]);
    expect(decodeName(raw, false, new Map([[0x7075, body]])).name).toBe('new.txt');
  });
});

describe('parseExtraFields', () => {
  test('ID와 길이로 필드를 나눈다', () => {
    const extra = new Uint8Array([
      0x01, 0x00, 0x02, 0x00, 0xaa, 0xbb, 0x55, 0x54, 0x01, 0x00, 0xcc,
    ]);
    const fields = parseExtraFields(extra);
    expect([...fields.get(0x0001)!]).toEqual([0xaa, 0xbb]);
    expect([...fields.get(0x5455)!]).toEqual([0xcc]);
  });
  test('길이가 남은 바이트를 넘으면 그 필드부터 버린다', () => {
    expect(parseExtraFields(new Uint8Array([0x01, 0x00, 0x09, 0x00, 0xaa])).size).toBe(0);
  });
});

describe('CP949 판단', () => {
  test('짝 없는 앞 바이트가 끝에 있으면 CP949가 아니다', () => {
    expect(decodeName(new Uint8Array([0x61, 0xb0]), false, NO_EXTRA).encoding).toBe('cp437');
  });
});
