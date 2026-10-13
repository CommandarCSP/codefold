import { AlertDialog } from 'radix-ui';
import { buttonClass } from '../button-class';

export interface ConfirmDialogProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly destructive?: boolean;
}

export interface ConfirmDialogViewProps extends ConfirmDialogProps {
  /** 확인하면 `true`, 취소하거나 닫으면 `false`. */
  readonly onResult: (confirmed: boolean) => void;
}

/**
 * 되돌릴 수 없는 조작 전에 묻는 확인창. nice-modal을 쓰지 않는다.
 * 쓰는 쪽의 nice-modal Provider와 섞이지 않게 열림 상태를 이 컴포넌트를 띄운 쪽이 들고 있다(ADR-0035).
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onResult,
}: ConfirmDialogViewProps) {
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onResult(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="cf:fixed cf:inset-0 cf:z-50 cf:bg-black/40" />
        <AlertDialog.Content className="cf:fixed cf:top-1/2 cf:left-1/2 cf:z-50 cf:w-[calc(100%-2rem)] cf:max-w-md cf:-translate-x-1/2 cf:-translate-y-1/2 cf:rounded-md cf:border cf:border-border cf:bg-background cf:p-6 cf:text-foreground cf:shadow-lg">
          <AlertDialog.Title className="cf:text-base cf:font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="cf:mt-2 cf:text-sm cf:text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="cf:mt-6 cf:flex cf:justify-end cf:gap-2">
            <AlertDialog.Cancel className={buttonClass('outline')} onClick={() => onResult(false)}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={buttonClass(destructive ? 'destructive' : 'primary')}
              onClick={() => onResult(true)}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
