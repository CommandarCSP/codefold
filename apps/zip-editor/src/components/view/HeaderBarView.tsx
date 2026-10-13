// apps/zip-editor/src/components/view/HeaderBarView.tsx
import { Download, FolderTree, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { messages } from '@/utils/messages';
import { UploadButtonView } from './UploadButtonView';

export interface HeaderBarViewProps {
  readonly canUpload: boolean;
  readonly canDownload: boolean;
  readonly downloading: boolean;
  /** 받지 않은 변경 수. null이면 배지를 숨긴다. */
  readonly unexportedCount: number | null;
  readonly showTreeToggle: boolean;
  readonly treeOpen: boolean;
  readonly onFiles: (files: File[]) => void;
  readonly onDownload: () => void;
  readonly onTreeToggle: () => void;
  readonly themeMenu?: ReactNode;
}

export function HeaderBarView(props: HeaderBarViewProps) {
  return (
    <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border px-3">
      {props.showTreeToggle && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={messages.treeToggle}
          aria-expanded={props.treeOpen}
          onClick={props.onTreeToggle}
        >
          <FolderTree aria-hidden />
        </Button>
      )}
      <h1 className="min-w-0 truncate text-sm font-semibold whitespace-nowrap">
        {messages.appTitle}
      </h1>
      {/* 좁은 화면(휴대폰)에서는 버튼 글자를 감추고 아이콘만 둔다. 글자는 sr-only로 남아 이름은 그대로다. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <UploadButtonView disabled={!props.canUpload} onFiles={props.onFiles} compact />
        <Button
          size="sm"
          disabled={!props.canDownload}
          aria-busy={props.downloading || undefined}
          onClick={props.onDownload}
        >
          {props.downloading ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : (
            <Download aria-hidden />
          )}
          <span className="max-sm:sr-only">
            {props.downloading ? messages.downloading : messages.download}
          </span>
        </Button>
        {props.unexportedCount !== null && (
          <Badge variant="secondary">
            <span className="max-sm:sr-only">{messages.unexported(props.unexportedCount)}</span>
            <span aria-hidden className="tabular-nums sm:hidden">
              {props.unexportedCount}
            </span>
          </Badge>
        )}
        {props.themeMenu}
      </div>
    </header>
  );
}
