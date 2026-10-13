import type { FileKind } from '@codefold/file-type-detector';
import { formatMessage, type CodeEditorMessages } from '../messages';
import { formatBytes, reasonMessage } from './format';

/** 편집할 수 없는 파일 안내. 크기와 판단 근거를 함께 보인다. */
export function BinaryView({
  messages,
  detected,
  size,
}: {
  readonly messages: CodeEditorMessages;
  readonly detected: FileKind;
  readonly size: number;
}) {
  return (
    <div className="cf:flex cf:h-full cf:flex-col cf:items-center cf:justify-center cf:gap-1 cf:p-6 cf:text-center cf:text-sm cf:text-muted-foreground">
      <p className="cf:font-medium cf:text-foreground">{messages.binaryNotice}</p>
      <p>
        {formatMessage(messages.binaryDetails, {
          size: formatBytes(size),
          reason: reasonMessage(messages, detected.reason),
        })}
      </p>
    </div>
  );
}
