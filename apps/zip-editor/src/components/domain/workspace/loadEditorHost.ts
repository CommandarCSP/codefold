// apps/zip-editor/src/components/domain/workspace/loadEditorHost.ts
import type { EditorLoader } from '@/business/hooks/workspace/editorModule';

/** 동적 import가 dockview·Monaco를 첫 화면 번들에서 떼어 낸다(ADR-0027). */
export const loadEditorHost: EditorLoader = () => import('./EditorHost');
