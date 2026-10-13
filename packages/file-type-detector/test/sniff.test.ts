import { describe, expect, test } from 'vitest';
import { detectTextEncoding } from '../src/detect';
import { sniffContent } from '../src/sniff';

const utf8 = (s: string) => new TextEncoder().encode(s);
// "안녕하세요, 세계! 한글 텍스트 파일입니다.\n"의 EUC-KR 바이트
const EUC_KR_SAMPLE = new Uint8Array([
  0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4, 0x2c, 0x20, 0xbc, 0xbc, 0xb0, 0xe8,
  0x21, 0x20, 0xc7, 0xd1, 0xb1, 0xdb, 0x20, 0xc5, 0xd8, 0xbd, 0xba, 0xc6, 0xae, 0x20, 0xc6, 0xc4,
  0xc0, 0xcf, 0xc0, 0xd4, 0xb4, 0xcf, 0xb4, 0xd9, 0x2e, 0x0a,
]);

describe('sniffContent', () => {
  test('UTF-8 BOM', () => {
    expect(sniffContent(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), false)).toEqual({
      type: 'text',
      encoding: 'utf-8-bom',
      rule: 'bom',
    });
  });

  test('UTF-16 BOM은 NUL 검사보다 먼저 본다', () => {
    const le = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
    const be = new Uint8Array([0xfe, 0xff, 0x00, 0x61, 0x00, 0x62]);
    expect(sniffContent(le, false)).toEqual({ type: 'text', encoding: 'utf-16le', rule: 'bom' });
    expect(sniffContent(be, false)).toEqual({ type: 'text', encoding: 'utf-16be', rule: 'bom' });
  });

  test('NUL이 있으면 바이너리', () => {
    expect(sniffContent(new Uint8Array([0x61, 0x00, 0x62]), false)).toEqual({
      type: 'binary',
      rule: 'nul',
    });
  });

  test('UTF-8 한글 텍스트', () => {
    expect(sniffContent(utf8('print("안녕")\n'), false)).toEqual({
      type: 'text',
      encoding: 'utf-8',
      rule: 'utf-8',
    });
  });

  test('앞부분 끝에서 잘린 UTF-8 한글은 텍스트로 본다', () => {
    const full = utf8('a'.repeat(8190) + '한글');
    const head = full.subarray(0, 8192); // '한'의 3바이트 가운데 2바이트에서 잘림
    expect(sniffContent(head, true)).toEqual({ type: 'text', encoding: 'utf-8', rule: 'utf-8' });
  });

  test('파일 전체인데 끝이 잘린 UTF-8은 UTF-8로 보지 않는다', () => {
    const broken = utf8('a한').subarray(0, 3);
    expect(sniffContent(broken, false)).not.toMatchObject({ encoding: 'utf-8' });
  });

  test('EUC-KR 한글 텍스트는 EUC-KR로 추정한다', () => {
    expect(sniffContent(EUC_KR_SAMPLE, false)).toEqual({
      type: 'text',
      encoding: 'euc-kr',
      rule: 'euc-kr',
    });
  });

  test('앞부분 끝에서 잘린 EUC-KR 글자도 EUC-KR로 본다', () => {
    const head = EUC_KR_SAMPLE.subarray(0, 3); // 두 번째 글자의 첫 바이트에서 잘림
    expect(sniffContent(head, true)).toEqual({ type: 'text', encoding: 'euc-kr', rule: 'euc-kr' });
  });

  test('UTF-8도 EUC-KR도 아니면 바이너리', () => {
    const noise = new Uint8Array([0x80, 0x81, 0xff, 0xfe, 0x90, 0x01, 0x02, 0x9f]);
    expect(sniffContent(noise, false)).toEqual({ type: 'binary', rule: 'undecodable' });
  });

  test('상자 선·기호가 많아도 한글이 있는 EUC-KR 문서는 EUC-KR로 본다', () => {
    // "━"×20 + " 안내 " + "━"×20 + "\n" (옛 한국어 README에 흔한 모양)
    const line = [0xa6, 0xac];
    const bytes = new Uint8Array([
      ...Array.from({ length: 20 }, () => line).flat(),
      0x20,
      0xbe,
      0xc8,
      0xb3,
      0xbb,
      0x20,
      ...Array.from({ length: 20 }, () => line).flat(),
      0x0a,
    ]);
    expect(sniffContent(bytes, false)).toEqual({
      type: 'text',
      encoding: 'euc-kr',
      rule: 'euc-kr',
    });
  });

  test('한글이 없는 EUC-KR 해석은 EUC-KR로 보지 않는다', () => {
    // EUC-KR로는 한자(行降項)로 읽히지만 한글이 없고, UTF-8로는 읽히지 않는 바이트
    const hanja = new Uint8Array([0xfa, 0xa1, 0xfa, 0xa2, 0xfa, 0xa3]);
    expect(sniffContent(hanja, false)).toEqual({ type: 'binary', rule: 'undecodable' });
  });
});

describe('BOM이 있어도 내용을 확인한다', () => {
  test('홀수 바이트 UTF-16처럼 BOM 인코딩으로 읽을 수 없으면 텍스트 인코딩을 돌려주지 않는다', () => {
    expect(detectTextEncoding(new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62]))).toBeUndefined();
  });

  test('UTF-8 BOM 뒤에 UTF-8로 읽을 수 없는 바이트가 있으면 텍스트 인코딩을 돌려주지 않는다', () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('a'.repeat(9000)),
      0xb0,
      0xa1,
    ]);
    expect(detectTextEncoding(bytes)).toBeUndefined();
  });

  test('올바른 BOM 파일은 그대로 그 인코딩이다', () => {
    expect(detectTextEncoding(new Uint8Array([0xff, 0xfe, 0x61, 0x00]))).toBe('utf-16le');
  });
});
