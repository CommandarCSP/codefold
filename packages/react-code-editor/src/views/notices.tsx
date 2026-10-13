import type { FileKind } from '@codefold/file-type-detector';
import type { ReactNode } from 'react';
import { buttonClass } from '../button-class';
import { formatMessage, type CodeEditorMessages } from '../messages';
import { kindName, type LargeFileLevel } from './format';

function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <div
      role="status"
      className="cf:flex cf:shrink-0 cf:items-center cf:gap-3 cf:border-b cf:border-border cf:bg-muted cf:px-3 cf:py-1.5 cf:text-sm cf:text-foreground"
    >
      {children}
    </div>
  );
}

/** EUC-KR 추정 텍스트 안내와 UTF-8 변환 버튼. */
export function EncodingNotice({
  messages,
  onConvert,
}: {
  readonly messages: CodeEditorMessages;
  readonly onConvert: () => void;
}) {
  return (
    <Notice>
      <span>{messages.eucKrNotice}</span>
      <button type="button" className={buttonClass('outline')} onClick={onConvert}>
        {messages.convertToUtf8}
      </button>
    </Notice>
  );
}

/** 확장자와 내용이 다를 때의 안내. 충돌이 없으면 아무것도 그리지 않는다. */
export function KindConflictNotice({
  messages,
  detected,
}: {
  readonly messages: CodeEditorMessages;
  readonly detected: FileKind;
}) {
  const conflict = detected.reason.extensionConflict;
  if (!conflict) return null;
  return (
    <Notice>
      <span>
        {formatMessage(messages.kindConflict, {
          extension: conflict.extension,
          kind: kindName(messages, detected.kind),
        })}
      </span>
    </Notice>
  );
}

/** 큰 파일 배너. */
export function LargeFileNotice({
  messages,
  level,
}: {
  readonly messages: CodeEditorMessages;
  readonly level: LargeFileLevel;
}) {
  if (level === 'normal') return null;
  return (
    <Notice>
      <span>{level === 'huge' ? messages.hugeFileNotice : messages.largeFileNotice}</span>
    </Notice>
  );
}
