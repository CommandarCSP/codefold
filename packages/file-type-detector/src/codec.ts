import type { TextEncodingName, WritableTextEncoding } from './types';

/** 텍스트로 판단한 파일을 전체 디코딩하다 실패했을 때 던진다. */
export class TextDecodeError extends Error {
  override readonly name = 'TextDecodeError';
  /** `binary-content`: 앞 8KB 뒤에서 바이너리(NUL)가 나왔다. `invalid-encoding`: 그 인코딩으로 읽을 수 없다. */
  readonly code: 'invalid-encoding' | 'binary-content';
  readonly encoding: TextEncodingName;

  constructor(code: 'invalid-encoding' | 'binary-content', encoding: TextEncodingName) {
    super(`${encoding} 텍스트로 읽을 수 없습니다 (${code})`);
    this.code = code;
    this.encoding = encoding;
  }
}

const DECODER_LABEL: Readonly<Record<TextEncodingName, string>> = {
  'utf-8': 'utf-8',
  'utf-8-bom': 'utf-8',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'euc-kr': 'euc-kr',
};

/**
 * 바이트를 인코딩에 맞춰 문자열로 읽는다. BOM은 결과에 넣지 않는다.
 * @throws {TextDecodeError} 그 인코딩으로 읽을 수 없거나 NUL이 나오면 던진다.
 */
export function decodeText(bytes: Uint8Array, encoding: TextEncodingName): string {
  let text: string;
  try {
    // ignoreBOM의 기본값이 false라서 인코딩에 맞는 BOM은 결과에서 빠진다.
    text = new TextDecoder(DECODER_LABEL[encoding], { fatal: true }).decode(bytes);
  } catch {
    throw new TextDecodeError('invalid-encoding', encoding);
  }
  if (text.includes('\u0000')) throw new TextDecodeError('binary-content', encoding);
  return text;
}

/**
 * 문자열을 원래 인코딩으로 다시 쓴다. BOM 인코딩은 앞에 BOM을 붙인다.
 * EUC-KR은 브라우저에 인코더가 없어 받지 않는다. 사용자가 UTF-8로 바꾼 뒤 `utf-8`로 쓴다(ADR-0010).
 */
export function encodeText(text: string, encoding: WritableTextEncoding): Uint8Array {
  switch (encoding) {
    case 'utf-8':
      return new TextEncoder().encode(text);
    case 'utf-8-bom': {
      const body = new TextEncoder().encode(text);
      const out = new Uint8Array(body.length + 3);
      out.set([0xef, 0xbb, 0xbf]);
      out.set(body, 3);
      return out;
    }
    case 'utf-16le':
      return encodeUtf16(text, true);
    case 'utf-16be':
      return encodeUtf16(text, false);
  }
}

// 브라우저에 UTF-16 인코더는 없지만, 문자열의 코드 단위를 2바이트씩 쓰면 된다.
// 짝 없는 서로게이트는 U+FFFD로 바꾼다. 그대로 쓰면 엄격한 디코더가 다시 읽지 못한다(UTF-8은 TextEncoder가 같은 일을 한다).
function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0xfeff, littleEndian);
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    const isHigh = unit >= 0xd800 && unit <= 0xdbff;
    const isLow = unit >= 0xdc00 && unit <= 0xdfff;
    const next = text.charCodeAt(i + 1);
    const prev = text.charCodeAt(i - 1);
    const paired =
      (isHigh && next >= 0xdc00 && next <= 0xdfff) || (isLow && prev >= 0xd800 && prev <= 0xdbff);
    view.setUint16(2 + i * 2, (isHigh || isLow) && !paired ? 0xfffd : unit, littleEndian);
  }
  return out;
}
