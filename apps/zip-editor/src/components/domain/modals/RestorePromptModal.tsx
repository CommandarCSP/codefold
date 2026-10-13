// apps/zip-editor/src/components/domain/modals/RestorePromptModal.tsx
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import type { RestorePromptProps } from '@/business/hooks/session/flowContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { messages } from '@/utils/messages';

/**
 * 복원 안내. 모달이 아니어서 떠 있는 동안에도 상단 업로드 버튼과 끌어 놓기로 새 ZIP을 열 수 있다.
 * 바깥을 누르거나 Esc를 눌러도 닫히지 않는다. 열리면 첫 버튼(이어 하기)으로 포커스가 간다(Task 18).
 */
export const RestorePromptModal = NiceModal.create(
  ({ saved, onResume, onDiscard }: RestorePromptProps) => {
    const modal = useModal();
    const choose = (action: () => void) => {
      void modal.hide();
      action();
    };
    return (
      <Dialog open={modal.visible} modal={false}>
        {/* 모달이 아니라 Radix가 배경을 덮지 않는다. 떠 있는 안내로 보이게 헤더 아래만 흐리게 덮되,
            클릭과 끌어 놓기는 그대로 아래로 지나가게 한다. */}
        {modal.visible && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-12 bottom-0 z-40 bg-background/70 backdrop-blur-[2px]"
          />
        )}
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{messages.restore.title}</DialogTitle>
            <DialogDescription>
              {messages.restore.detail(saved.zipName, saved.updatedAt)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => choose(onResume)}>{messages.restore.resume}</Button>
            <Button variant="outline" onClick={() => choose(onDiscard)}>
              {messages.restore.discard}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
