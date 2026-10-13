import type { DetectReason, KindCategory, TextSizeClass } from '@codefold/file-type-detector';
import { formatMessage, type CodeEditorMessages } from '../messages';

/** 바이트 수를 읽기 쉬운 크기로(1.5 KB, 20 MB). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** 파일 종류 판단 근거의 문구. */
export function reasonMessage(messages: CodeEditorMessages, reason: DetectReason): string {
  switch (reason.rule) {
    case 'signature':
      return formatMessage(messages.reasonSignature, { signature: reason.signature ?? '' });
    case 'extension':
      return messages.reasonExtension;
    case 'nul':
      return messages.reasonNul;
    case 'undecodable':
      return messages.reasonUndecodable;
    default:
      return messages.reasonContent;
  }
}

export function kindName(messages: CodeEditorMessages, kind: KindCategory): string {
  switch (kind) {
    case 'text':
      return messages.kindText;
    case 'image':
      return messages.kindImage;
    case 'binary':
      return messages.kindBinary;
  }
}

export type LargeFileLevel = 'normal' | 'large' | 'huge';

// Monaco의 판단 메서드는 공개 타입에 없어, 있으면 부르고 없으면 바이트 기준 추정(sizeClass)으로 대신한다.
interface LargeFileProbe {
  isTooLargeForTokenization?(): boolean;
  isTooLargeForSyncing?(): boolean;
}

/** 큰 파일 단계. `large`는 구문 강조·접기가 꺼지고, `huge`는 언어 worker로도 보내지 않는다. */
export function largeFileLevel(model: object, sizeClass: TextSizeClass): LargeFileLevel {
  const probe = model as LargeFileProbe;
  if (probe.isTooLargeForSyncing?.() ?? sizeClass === 'huge') return 'huge';
  if (probe.isTooLargeForTokenization?.() ?? sizeClass === 'large') return 'large';
  return 'normal';
}
