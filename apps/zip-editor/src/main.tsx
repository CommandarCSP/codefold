// apps/zip-editor/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { resolveTheme } from './business/hooks/theme/themeBusiness';
import { applyThemeClass, prefersDark, readThemePreference } from './services/browser/theme';

applyThemeClass(resolveTheme(readThemePreference(), prefersDark()));

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소가 없습니다');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
