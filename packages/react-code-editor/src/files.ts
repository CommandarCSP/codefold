import {
  decodeText,
  detectFileKind,
  detectTextEncoding,
  HEAD_SIZE,
  TextDecodeError,
  type FileKind,
  type TextInfo,
} from '@codefold/file-type-detector';
import type { VirtualFs } from '@codefold/virtual-fs';
import type { LoadedFile } from './types';

/** 원본 파일을 읽은 결과. model은 만들지 않는다. */
export type OriginalFile =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly info: TextInfo;
      readonly detected: FileKind;
    }
  | {
      readonly kind: 'image';
      readonly mime: string;
      readonly bytes: Uint8Array;
      readonly info: TextInfo | undefined;
      readonly detected: FileKind;
    }
  | { readonly kind: 'binary'; readonly detected: FileKind };

/** 새로 만든 파일은 빈 UTF-8 텍스트다. */
export const NEW_FILE_INFO: TextInfo = { encoding: 'utf-8', readOnly: false, sizeClass: 'normal' };
export const NEW_FILE_KIND: FileKind = {
  kind: 'text',
  reason: { rule: 'empty' },
  ...NEW_FILE_INFO,
};

/**
 * 원본 파일을 읽는다. 앞부분으로 종류를 판단하고(ADR-0031), 텍스트와 이미지는 전체를 읽는다.
 * 텍스트 디코딩이 실패하면 전체 바이트로 인코딩을 다시 정하고, 그래도 안 되면 바이너리로 본다.
 */
export async function readOriginal(fs: VirtualFs, path: string): Promise<OriginalFile> {
  const node = fs.getNode(path);
  if (node && !node.isDirectory && fs.originalPathOf(path) === undefined) {
    return { kind: 'text', text: '', info: NEW_FILE_INFO, detected: NEW_FILE_KIND };
  }
  // 없는 경로와 폴더는 여기서 virtual-fs가 PathNotFoundError·NotAFileError를 던진다.
  const head = await fs.readHead(path, HEAD_SIZE);
  const detected = detectFileKind(node?.name ?? path, head, node?.size ?? head.length);
  if (detected.kind === 'binary') return { kind: 'binary', detected };
  const bytes = await fs.readAll(path);
  if (detected.kind === 'image') {
    // SVG처럼 텍스트이기도 한 이미지는 전체를 실제로 읽어 본다. 읽지 못하면 이미지로만 보고 "코드로 보기"를 막는다.
    const info = detected.text ? decode(bytes, detected.text)?.info : undefined;
    return { kind: 'image', mime: detected.mime, bytes, info, detected };
  }
  const decoded = decode(bytes, detected);
  return decoded ? { kind: 'text', ...decoded, detected } : { kind: 'binary', detected };
}

function decode(bytes: Uint8Array, info: TextInfo): { text: string; info: TextInfo } | undefined {
  try {
    return { text: decodeText(bytes, info.encoding), info: pick(info) };
  } catch (error) {
    if (!(error instanceof TextDecodeError)) throw error;
    if (error.code === 'binary-content') return undefined;
    // 앞 8KB만 보고 정한 인코딩이 틀렸다. 전체 바이트로 다시 정한다(ADR-0031).
    const encoding = detectTextEncoding(bytes);
    if (encoding === undefined) return undefined;
    try {
      return {
        text: decodeText(bytes, encoding),
        info: { encoding, readOnly: encoding === 'euc-kr', sizeClass: info.sizeClass },
      };
    } catch {
      return undefined;
    }
  }
}

const pick = (info: TextInfo): TextInfo => ({
  encoding: info.encoding,
  readOnly: info.readOnly,
  sizeClass: info.sizeClass,
});

/** 원본 읽기 결과를 연 파일 정보로 바꾼다. */
export function toLoaded(path: string, original: OriginalFile): LoadedFile {
  switch (original.kind) {
    case 'text':
      return { kind: 'text', path, info: original.info, detected: original.detected };
    case 'image':
      return {
        kind: 'image',
        path,
        mime: original.mime,
        bytes: original.bytes,
        info: original.info,
        detected: original.detected,
      };
    case 'binary':
      return { kind: 'binary', path, detected: original.detected };
  }
}
