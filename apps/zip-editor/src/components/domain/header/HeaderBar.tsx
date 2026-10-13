// apps/zip-editor/src/components/domain/header/HeaderBar.tsx
import { useHeaderBarViewModel } from '@/business/hooks/viewModels/useHeaderBarViewModel';
import { HeaderBarView } from '@/components/view/HeaderBarView';
import { ThemeMenu } from './ThemeMenu';

export function HeaderBar() {
  const vm = useHeaderBarViewModel();
  return (
    <HeaderBarView
      canUpload={vm.canUpload}
      canDownload={vm.canDownload}
      downloading={vm.downloading}
      unexportedCount={vm.unexportedCount}
      showTreeToggle={vm.showTreeToggle}
      treeOpen={vm.treeOpen}
      onFiles={vm.onFiles}
      onDownload={vm.onDownload}
      onTreeToggle={vm.onTreeToggle}
      themeMenu={<ThemeMenu />}
    />
  );
}
