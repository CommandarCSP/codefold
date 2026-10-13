import { useEffect, useRef, useState } from 'react';
import { useAreaContext } from '../area/area-context';
import { buttonClass } from '../button-class';
import { FileChangedError } from '../errors';
import { nameOf } from '../paths';
import type { LoadedFile } from '../types';
import { TextView } from './text-view';

export interface ImageViewProps {
  readonly panelId: string;
  readonly groupId: string;
  readonly file: Extract<LoadedFile, { kind: 'image' }>;
  readonly visible: boolean;
  readonly onMissing: () => void;
}

/**
 * 이미지를 `<img>`와 object URL로 보인다. SVG는 "코드로 보기"로 텍스트를 고칠 수 있고,
 * 이미지로 돌아오면 고친 내용으로 다시 그린다.
 */
export function ImageView({ panelId, groupId, file, visible, onMissing }: ImageViewProps) {
  const { workspace, messages } = useAreaContext();
  const [mode, setMode] = useState<'image' | 'code'>('image');
  if (mode === 'code') {
    return (
      <div className="cf:flex cf:h-full cf:min-h-0 cf:flex-col">
        <div className="cf:flex cf:shrink-0 cf:justify-end cf:border-b cf:border-border cf:px-2 cf:py-1">
          <button type="button" className={buttonClass('outline')} onClick={() => setMode('image')}>
            {messages.viewAsImage}
          </button>
        </div>
        <TextView
          panelId={panelId}
          groupId={groupId}
          path={file.path}
          visible={visible}
          onMissing={onMissing}
        />
      </div>
    );
  }
  return (
    <ImagePreview
      file={file}
      // 고친 SVG는 model의 지금 내용으로 그린다. 렌더 중에 읽으면 React Compiler가 값을 기억해 버리므로 effect에서 읽는다.
      readSource={() => workspace.registry.get(file.path)?.getValue()}
      canShowCode={file.info !== undefined}
      codeLabel={messages.viewAsCode}
      onShowCode={() => {
        workspace.loadAsText(file.path).then(
          () => setMode('code'),
          (error: unknown) => {
            // 읽는 도중 이름이 바뀌었거나 지워졌다. 탭이 새 경로로 다시 그려지므로 여기서는 버린다.
            if (!(error instanceof FileChangedError)) throw error;
          },
        );
      }}
    />
  );
}

interface ImagePreviewProps {
  readonly file: Extract<LoadedFile, { kind: 'image' }>;
  /** 이미지로 보일 때 한 번 부른다. model이 있으면 그 내용을 돌려준다. */
  readonly readSource: () => string | undefined;
  readonly canShowCode: boolean;
  readonly codeLabel: string;
  readonly onShowCode: () => void;
}

function ImagePreview({ file, readSource, canShowCode, codeLabel, onShowCode }: ImagePreviewProps) {
  const image = useRef<HTMLImageElement>(null);
  // object URL은 이 보기가 사라지면 해제한다. 코드 보기에서 돌아오면 새로 마운트되어 다시 만든다.
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const source = readSource();
    const blob = new Blob([source ?? (file.bytes as Uint8Array<ArrayBuffer>)], { type: file.mime });
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, readSource]);
  return (
    <div className="cf:relative cf:flex cf:h-full cf:items-center cf:justify-center cf:overflow-auto cf:bg-muted cf:p-4">
      {/* max-h-full로 줄이면 WebKit은 고유 크기가 없는 SVG(width·height·viewBox 없음)의 폭을 0으로 그린다.
          상자를 보기 영역만큼 두고 scale-down으로 그려, 큰 이미지는 맞춰 줄이고 작은 이미지는 원래 크기로 보인다. */}
      <img
        ref={image}
        alt={nameOf(file.path)}
        className="cf:h-full cf:w-full cf:object-scale-down"
      />
      {canShowCode && (
        <button
          type="button"
          className={`${buttonClass('outline')} cf:absolute cf:top-2 cf:right-2`}
          onClick={onShowCode}
        >
          {codeLabel}
        </button>
      )}
    </div>
  );
}
