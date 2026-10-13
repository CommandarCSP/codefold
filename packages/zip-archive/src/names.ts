import { view } from './bytes';
import { crc32 } from './crc32';
import type { NameEncoding } from './types';

// CP437의 0x80~0xFF. 브라우저 TextDecoder가 CP437을 지원하지 않아 표를 직접 둔다.
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

const INFO_ZIP_UNICODE_PATH = 0x7075;

/** 확장 필드를 ID별로 나눈다. 길이가 맞지 않는 필드부터는 버린다. */
export function parseExtraFields(extra: Uint8Array): Map<number, Uint8Array> {
  const fields = new Map<number, Uint8Array>();
  const v = view(extra);
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = v.getUint16(offset, true);
    const length = v.getUint16(offset + 2, true);
    const start = offset + 4;
    if (start + length > extra.length) break;
    fields.set(id, extra.subarray(start, start + length));
    offset = start + length;
  }
  return fields;
}

/**
 * 파일 이름 바이트를 문자열로 읽는다. UTF-8 플래그 → 유니코드 경로 확장 필드 → 엄격한 UTF-8 → CP949 → CP437 순서다(ADR-0001).
 * 결과는 NFC로 정규화한다. macOS Finder는 한글을 자모로 쪼갠 NFD로 저장할 때가 있다.
 */
export function decodeName(
  raw: Uint8Array,
  utf8Flag: boolean,
  extra: Map<number, Uint8Array>,
): { name: string; encoding: NameEncoding } {
  const result = decodeRaw(raw, utf8Flag, extra);
  return { name: result.name.normalize('NFC'), encoding: result.encoding };
}

function decodeRaw(
  raw: Uint8Array,
  utf8Flag: boolean,
  extra: Map<number, Uint8Array>,
): { name: string; encoding: NameEncoding } {
  if (utf8Flag) return { name: new TextDecoder('utf-8').decode(raw), encoding: 'utf-8' };

  const unicodePath = extra.get(INFO_ZIP_UNICODE_PATH);
  if (unicodePath && unicodePath.length > 5 && unicodePath[0] === 1) {
    // 이름 바이트의 CRC가 맞을 때만 쓴다. 다르면 이름을 나중에 바꾼 ZIP이라 필드가 낡았다.
    if (view(unicodePath).getUint32(1, true) === crc32(raw)) {
      const name = strict('utf-8', unicodePath.subarray(5));
      if (name !== undefined) return { name, encoding: 'utf-8' };
    }
  }

  const utf8 = strict('utf-8', raw);
  if (utf8 !== undefined) return { name: utf8, encoding: 'utf-8' };
  const cp949 = hasCp949Structure(raw) ? strict('euc-kr', raw) : undefined;
  if (cp949 !== undefined && !cp949.includes('\uFFFD')) return { name: cp949, encoding: 'cp949' };
  return { name: decodeCp437(raw), encoding: 'cp437' };
}

function strict(label: string, bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

// 모든 비ASCII 바이트가 "앞 바이트(0x81~0xFE) + 뒤 바이트(A~Z, a~z, 0x81~0xFE)" 짝인지 본다.
// Node(ICU)의 euc-kr 디코더는 fatal이어도 짝 없는 앞 바이트를 말없이 버리므로 디코더에만 맡기지 않는다.
function hasCp949Structure(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i += 1) {
    const lead = bytes[i]!;
    if (lead < 0x80) continue;
    const trail = bytes[i + 1];
    if (lead === 0x80 || lead === 0xff || trail === undefined) return false;
    const trailOk =
      (trail >= 0x41 && trail <= 0x5a) ||
      (trail >= 0x61 && trail <= 0x7a) ||
      (trail >= 0x81 && trail <= 0xfe);
    if (!trailOk) return false;
    i += 1;
  }
  return true;
}

function decodeCp437(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes)
    out += byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80];
  return out;
}
