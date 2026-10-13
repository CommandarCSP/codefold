import type { IDockviewHeaderActionsProps } from 'dockview-react';
import { Columns2 } from 'lucide-react';
import { IconButton } from '../ui';
import { useAreaContext } from './area-context';

/** 그룹 머리의 "오른쪽으로 나누기". 떠 있는 그룹은 두지 않는다(ADR-0042). */
export function GroupActions({ activePanel }: IDockviewHeaderActionsProps) {
  const { area, messages } = useAreaContext();
  if (!activePanel || !area) return null;
  return (
    <div className="cf:flex cf:h-full cf:items-center cf:gap-0.5 cf:px-1">
      <IconButton
        // 영역이 좁으면(휴대폰) 나눠도 쓸 수 없어 styles.css의 컨테이너 쿼리로 감춘다.
        className="cf-split-action"
        label={messages.splitRight}
        onClick={() => {
          activePanel.api.setActive();
          area.splitActive();
        }}
      >
        <Columns2 aria-hidden className="cf:size-4" />
      </IconButton>
    </div>
  );
}
