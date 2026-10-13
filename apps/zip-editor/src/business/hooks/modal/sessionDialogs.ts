// apps/zip-editor/src/business/hooks/modal/sessionDialogs.ts
import NiceModal from '@ebay/nice-modal-react';
import { MODAL_IDS } from '@/modals/ids';
import type { ConfirmOptions } from '../session/sessionBusiness';
import type { SessionDialogs } from '../session/flowContext';

/**
 * ConfirmModal에 넘기는 실제 props. `openerElement`는 이 파일이 부르는 순간(연 요소가 아직 활성일 때)
 * 잡아 넘긴다 — `ConfirmOptions`(business/sessionBusiness.ts, 순수 함수)는 DOM을 모른다(Task 18).
 */
export interface ConfirmModalProps extends ConfirmOptions {
  readonly openerElement: HTMLElement | null;
}

/** 흐름이 부르는 앱 확인창. NiceModal.Provider 안에서 등록한 id로 띄운다(src/modals/registry.ts). */
export function createSessionDialogs(): SessionDialogs {
  return {
    confirm: (options) =>
      NiceModal.show<boolean, ConfirmModalProps>(MODAL_IDS.confirm, {
        ...options,
        openerElement:
          document.activeElement instanceof HTMLElement ? document.activeElement : null,
      }),
    showRestorePrompt: (props) => {
      void NiceModal.show(MODAL_IDS.restorePrompt, props);
    },
    hideRestorePrompt: () => {
      void NiceModal.hide(MODAL_IDS.restorePrompt);
    },
  };
}
