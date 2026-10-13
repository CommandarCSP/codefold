// apps/zip-editor/src/components/domain/upload/DropZone.tsx
import { useDropZoneViewModel } from '@/business/hooks/viewModels/useDropZoneViewModel';
import { DropOverlayView } from '@/components/view/DropOverlayView';

export function DropZone() {
  const { active } = useDropZoneViewModel();
  return active ? <DropOverlayView /> : null;
}
