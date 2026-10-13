export { decodeText, encodeText, TextDecodeError } from './codec';
export { HEAD_SIZE, HUGE_TEXT_BYTES, LARGE_TEXT_BYTES } from './constants';
export { detectFileKind, detectTextEncoding } from './detect';
export { guessKindByExtension } from './extensions';
export type {
  DetectReason,
  DetectRule,
  ExtensionConflict,
  FileKind,
  KindCategory,
  TextEncodingName,
  TextInfo,
  TextSizeClass,
  WritableTextEncoding,
} from './types';
