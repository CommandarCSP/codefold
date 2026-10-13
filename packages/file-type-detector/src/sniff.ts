import type { TextEncodingName } from './types';

export type ContentVerdict =
  | {
      readonly type: 'text';
      readonly encoding: TextEncodingName;
      readonly rule: 'bom' | 'utf-8' | 'euc-kr';
    }
  | { readonly type: 'binary'; readonly rule: 'nul' | 'undecodable' };

// EUC-KR 해석에서 한글 음절이 (한글 + 한자) 가운데 이 비율 이상이어야 한국어 텍스트로 본다.
// 다른 레거시 인코딩(Shift_JIS 등)을 EUC-KR로 잘못 읽으면 한자가 대부분이 된다.
// 상자 선(━)·※ 같은 기호는 한국어 문서에도 많이 나오므로 비율 계산에서 뺀다.
const MIN_HANGUL_RATIO = 0.5;
const MAX_CONTROL_RATIO = 0.01;

/**
 * 파일 앞부분 바이트로 텍스트인지, 어떤 인코딩인지 판단한다(ADR-0010 판단 순서 3).
 * @param truncated `sample`이 파일의 앞부분일 뿐이면 `true`. 끝에서 잘린 멀티바이트 글자를 오류로 보지 않는다.
 */
export function sniffContent(sample: Uint8Array, truncated: boolean): ContentVerdict {
  const bom = detectBom(sample);
  if (bom) {
    // BOM이 있어도 그 인코딩으로 실제로 읽히는지 본다. 읽히지 않으면 BOM을 믿을 수 없다.
    const label = bom === 'utf-8-bom' ? 'utf-8' : bom;
    if (decodesStrictly(sample, label, truncated) === undefined) {
      return { type: 'binary', rule: 'undecodable' };
    }
    return { type: 'text', encoding: bom, rule: 'bom' };
  }
  if (sample.includes(0)) return { type: 'binary', rule: 'nul' };
  if (decodesStrictly(sample, 'utf-8', truncated) !== undefined) {
    return { type: 'text', encoding: 'utf-8', rule: 'utf-8' };
  }
  if (looksLikeEucKr(sample, truncated)) {
    return { type: 'text', encoding: 'euc-kr', rule: 'euc-kr' };
  }
  return { type: 'binary', rule: 'undecodable' };
}

function detectBom(sample: Uint8Array): TextEncodingName | undefined {
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) return 'utf-8-bom';
  if (sample[0] === 0xff && sample[1] === 0xfe) return 'utf-16le';
  if (sample[0] === 0xfe && sample[1] === 0xff) return 'utf-16be';
  return undefined;
}

// stream: true면 끝에서 끊긴 글자를 다음 조각을 기다리는 것으로 보고 오류를 내지 않는다.
function decodesStrictly(
  sample: Uint8Array,
  label: string,
  truncated: boolean,
): string | undefined {
  try {
    return new TextDecoder(label, { fatal: true }).decode(sample, { stream: truncated });
  } catch {
    return undefined;
  }
}

function looksLikeEucKr(sample: Uint8Array, truncated: boolean): boolean {
  const text = decodesStrictly(sample, 'euc-kr', truncated);
  if (text === undefined || text.length === 0) return false;
  let hangul = 0;
  let hanja = 0;
  let controls = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) hangul += 1;
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) hanja += 1;
    else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) controls += 1;
  }
  return (
    hangul > 0 &&
    hangul / (hangul + hanja) >= MIN_HANGUL_RATIO &&
    controls / text.length < MAX_CONTROL_RATIO
  );
}
