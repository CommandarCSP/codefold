import { useState, type ReactNode } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog';

/**
 * 확인창을 띄우는 훅. `confirm(props)`는 확인하면 `true`, 아니면 `false`로 끝나는 Promise를 돌려주고,
 * 두 번째 값(확인창 요소)은 그 컴포넌트의 JSX 안에 그려 둔다.
 */
export function useConfirm(): readonly [
  (props: ConfirmDialogProps) => Promise<boolean>,
  ReactNode,
] {
  const [pending, setPending] = useState<{
    readonly props: ConfirmDialogProps;
    readonly resolve: (confirmed: boolean) => void;
  } | null>(null);
  const confirm = (props: ConfirmDialogProps) =>
    new Promise<boolean>((resolve) => {
      setPending({ props, resolve });
    });
  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };
  const dialog = pending ? <ConfirmDialog {...pending.props} onResult={settle} /> : null;
  return [confirm, dialog] as const;
}
