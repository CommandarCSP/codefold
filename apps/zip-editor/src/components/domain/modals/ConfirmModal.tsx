// apps/zip-editor/src/components/domain/modals/ConfirmModal.tsx
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import type { ConfirmModalProps } from '@/business/hooks/modal/sessionDialogs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * 앱 확인창. 확인이면 true, 취소·Esc면 false로 끝난다. 닫히면 연 요소로 포커스가 돌아간다.
 * - 2026-09 · Task 18: `<AlertDialogTrigger>` 없이 nice-modal로 여는 확인창이라 Radix 기본 동작(Trigger의
 *   ref를 기억하는 `triggerRef`)이 비어 있다. 대신 부르는 쪽(sessionDialogs)이 넘긴 `openerElement`(연 순간의
 *   활성 요소)로 되돌린다.
 */
export const ConfirmModal = NiceModal.create((props: ConfirmModalProps) => {
  const modal = useModal();
  const close = (confirmed: boolean) => {
    modal.resolve(confirmed);
    void modal.hide();
  };
  return (
    <AlertDialog open={modal.visible} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          props.openerElement?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{props.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>{props.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
