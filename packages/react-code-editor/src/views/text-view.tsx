import { ModelNotFoundError } from '@codefold/monaco-binding';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { useAreaContext } from '../area/area-context';
import { largeFileLevel } from './format';
import { EncodingNotice, LargeFileNotice } from './notices';

export interface TextViewProps {
  readonly panelId: string;
  readonly groupId: string;
  readonly path: string;
  /** 탭이 그룹에서 보이는지. 보일 때만 그룹 에디터를 붙인다. */
  readonly visible: boolean;
  /** model이 사라져 다시 읽어야 할 때. */
  readonly onMissing: () => void;
}

/**
 * 그 그룹의 에디터를 이 탭 자리에 옮겨 붙이고 model을 보인다(ADR-0007).
 * 탭이 사라지면 호스트만 떼고 에디터는 그룹에 남긴다.
 */
export function TextView({ panelId, groupId, path, visible, onMissing }: TextViewProps) {
  const { workspace, area, messages } = useAreaContext();
  const host = useRef<HTMLDivElement>(null);
  const info = useSyncExternalStore(
    (onChange) => {
      const subscription = workspace.onFileInfoChange((changed) => {
        if (changed === path) onChange();
      });
      return () => subscription.dispose();
    },
    () => workspace.textInfo(path),
  );
  const locked = useStore(workspace.store, (state) => state.readOnly);
  const readOnly = locked || (info?.readOnly ?? false);

  // 탭 수는 보이는지와 상관없이 탭이 생기면 올린다. dockview는 되살린 탭을 가려진 채로 마운트하므로,
  // 보일 때만 올리면 한 번도 보지 않고 닫은 탭의 model이 남는다.
  useEffect(() => {
    if (!area) return;
    try {
      area.acquire(panelId, path);
    } catch (error) {
      // 다른 탭이 닫히며 model이 먼저 지워졌다. 다시 읽게 한다.
      if (error instanceof ModelNotFoundError) onMissing();
      else throw error;
    }
  }, [area, panelId, path, onMissing]);

  useEffect(() => {
    const element = host.current;
    if (!area || !element || !visible || !workspace.registry.get(path)) return;
    const entry = area.editorFor(groupId);
    element.append(entry.host);
    entry.group.show(path);
    // 호스트를 옮기면 포커스가 풀리므로, 미뤄 둔 포커스 요청은 붙인 뒤에 처리한다.
    if (area.takeFocusRequest(path)) entry.group.editor.focus();
    return () => {
      // 같은 그룹의 다른 탭이 이미 호스트를 가져갔으면 건드리지 않는다.
      if (entry.host.parentElement === element) entry.host.remove();
    };
  }, [area, workspace, groupId, path, visible]);

  // 그룹 에디터는 그룹의 탭이 함께 쓴다. 보이는 탭만 읽기 전용 여부를 정한다.
  useEffect(() => {
    if (visible) area?.editorFor(groupId).group.editor.updateOptions({ readOnly });
  }, [area, groupId, visible, readOnly]);

  const model = workspace.registry.get(path);
  const level = model && info ? largeFileLevel(model, info.sizeClass) : 'normal';
  return (
    <div className="cf:flex cf:h-full cf:min-h-0 cf:flex-col">
      {info?.encoding === 'euc-kr' && info.readOnly && (
        <EncodingNotice messages={messages} onConvert={() => workspace.convertToUtf8(path)} />
      )}
      <LargeFileNotice messages={messages} level={level} />
      <div ref={host} className="cf:min-h-0 cf:flex-1" />
    </div>
  );
}
