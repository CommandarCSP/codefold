// apps/zip-editor/src/modals/registry.ts
import NiceModal from '@ebay/nice-modal-react';
import { ConfirmModal } from '@/components/domain/modals/ConfirmModal';
import { RestorePromptModal } from '@/components/domain/modals/RestorePromptModal';
import { MODAL_IDS } from './ids';

// 앱에서 한 번 import한다(App.tsx). 등록은 이 파일에서만 한다(modal-management).
NiceModal.register(MODAL_IDS.confirm, ConfirmModal);
NiceModal.register(MODAL_IDS.restorePrompt, RestorePromptModal);
