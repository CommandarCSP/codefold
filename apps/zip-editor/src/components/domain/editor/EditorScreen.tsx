// apps/zip-editor/src/components/domain/editor/EditorScreen.tsx
import { useAppContext } from '@/business/hooks/session/appContext';
import {
  InsecureContextNoticeView,
  UnsupportedBrowserNoticeView,
} from '@/components/view/EnvironmentNoticeViews';
import { Workbench } from './Workbench';

/**
 * 브라우저를 먼저 확인한다(design.md 시퀀스 7의 0번). 안내 화면이면 Workbench를 마운트하지 않으므로
 * 잠금 요청도 복원 안내도 일어나지 않는다.
 */
export function EditorScreen() {
  const { environment } = useAppContext();
  if (environment.kind === 'insecure') return <InsecureContextNoticeView />;
  if (environment.kind === 'unsupported') return <UnsupportedBrowserNoticeView />;
  return <Workbench />;
}
