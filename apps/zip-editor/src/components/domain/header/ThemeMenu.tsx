// apps/zip-editor/src/components/domain/header/ThemeMenu.tsx
import { useTheme } from '@/business/hooks/theme/useTheme';
import { ThemeMenuView } from '@/components/view/ThemeMenuView';

export function ThemeMenu() {
  const { preference, resolved, setPreference } = useTheme();
  return <ThemeMenuView preference={preference} resolved={resolved} onChange={setPreference} />;
}
