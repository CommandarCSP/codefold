import { HEAD_SIZE, HUGE_TEXT_BYTES, LARGE_TEXT_BYTES } from './constants';
import { expectedCategory, extensionOf, imageMimeForExtension } from './extensions';
import { matchSignature } from './signatures';
import { sniffContent } from './sniff';
import type {
  DetectReason,
  FileKind,
  KindCategory,
  TextEncodingName,
  TextInfo,
  TextSizeClass,
} from './types';

/**
 * 파일 이름과 앞부분 바이트로 파일 종류를 판단한다(ADR-0010).
 *
 * @param name 파일 이름 또는 경로. 확장자만 쓴다.
 * @param head 파일 앞부분. `HEAD_SIZE`(8KB)만큼이면 충분하고, 그보다 길어도 앞 8KB만 본다.
 * @param totalSize 파일 전체 크기(바이트). `head`가 이보다 짧으면 끝이 잘린 것으로 본다.
 */
export function detectFileKind(name: string, head: Uint8Array, totalSize: number): FileKind {
  if (totalSize === 0)
    return { kind: 'text', ...textInfo('utf-8', totalSize), reason: { rule: 'empty' } };

  const sample = head.length > HEAD_SIZE ? head.subarray(0, HEAD_SIZE) : head;
  const truncated = sample.length < totalSize;
  const extension = extensionOf(name);
  const expected = expectedCategory(extension);

  const signature = matchSignature(sample);
  if (signature) {
    const reason = withConflict(
      { rule: 'signature', signature: signature.name },
      extension,
      expected,
      signature.category,
    );
    return signature.category === 'image'
      ? { kind: 'image', mime: signature.mime, reason }
      : { kind: 'binary', reason };
  }

  if (expected === 'binary') return { kind: 'binary', reason: { rule: 'extension' } };

  const content = sniffContent(sample, truncated);
  const svgMime = extension === 'svg' ? imageMimeForExtension(extension) : undefined;
  if (svgMime && content.type === 'text') {
    return {
      kind: 'image',
      mime: svgMime,
      text: textInfo(content.encoding, totalSize),
      reason: { rule: content.rule },
    };
  }
  const reason = withConflict({ rule: content.rule }, extension, expected, content.type);
  return content.type === 'text'
    ? { kind: 'text', ...textInfo(content.encoding, totalSize), reason }
    : { kind: 'binary', reason };
}

/**
 * 파일 전체 바이트로 텍스트 인코딩을 다시 판단한다. 텍스트가 아니면 `undefined`다.
 *
 * `detectFileKind`는 앞 8KB만 보므로, 앞부분이 ASCII뿐이고 뒤에 EUC-KR 한글이 나오는 파일을
 * `utf-8`로 판단할 수 있다. 그런 파일은 `decodeText(전체, 'utf-8')`이 `invalid-encoding`으로 실패한다.
 * 이때 전체 바이트로 이 함수를 불러 인코딩을 다시 정한다. `undefined`면 바이너리로 보인다.
 */
export function detectTextEncoding(bytes: Uint8Array): TextEncodingName | undefined {
  const content = sniffContent(bytes, false);
  return content.type === 'text' ? content.encoding : undefined;
}

function withConflict(
  reason: DetectReason,
  extension: string,
  expected: KindCategory | undefined,
  actual: KindCategory,
): DetectReason {
  if (expected === undefined || expected === actual) return reason;
  return { ...reason, extensionConflict: { extension, expected } };
}

function textInfo(encoding: TextEncodingName, totalSize: number): TextInfo {
  return { encoding, readOnly: encoding === 'euc-kr', sizeClass: sizeClassOf(totalSize) };
}

function sizeClassOf(totalSize: number): TextSizeClass {
  if (totalSize > HUGE_TEXT_BYTES) return 'huge';
  if (totalSize > LARGE_TEXT_BYTES) return 'large';
  return 'normal';
}
