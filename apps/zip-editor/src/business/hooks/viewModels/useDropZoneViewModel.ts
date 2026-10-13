// apps/zip-editor/src/business/hooks/viewModels/useDropZoneViewModel.ts
import { useEffect, useState } from 'react';
import { subscribeFileDrag } from '@/services/browser/fileDrag';
import { useAppContext } from '../session/appContext';
import { canUpload } from '../session/sessionBusiness';

/** 화면 전체 놓기 영역. 놓은 파일은 업로드 버튼과 같은 흐름으로 간다. */
export function useDropZoneViewModel() {
  const { flows, store } = useAppContext();
  const [active, setActive] = useState(false);
  useEffect(() => {
    const subscription = subscribeFileDrag(window, {
      canDrop: () => canUpload(store.getState()),
      onActiveChange: setActive,
      onDrop: (files) => void flows.openFiles(files),
    });
    return () => subscription.dispose();
  }, [flows, store]);
  return { active };
}
