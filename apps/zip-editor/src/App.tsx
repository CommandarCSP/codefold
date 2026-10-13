// apps/zip-editor/src/App.tsx
import { AppProviders } from './AppProviders';
import { RootErrorBoundary } from './components/error/RootErrorBoundary';
import './modals/registry';
import { EditorPage } from './pages/EditorPage';

export default function App() {
  return (
    <RootErrorBoundary>
      <AppProviders>
        <EditorPage />
      </AppProviders>
    </RootErrorBoundary>
  );
}
