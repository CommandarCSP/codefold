import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// peer와 dependencies는 번들에 넣지 않는다. 쓰는 쪽 번들러가 한 벌만 두게 한다(ADR-0034).
const externals = [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)];
const isExternal = (id: string) =>
  externals.some((name) => id === name || id.startsWith(`${name}/`));

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    // 테스트는 워크스페이스 패키지의 src를 바로 읽는다(ADR-0005).
    conditions: ['source', ...defaultClientConditions],
  },
  // `// @vitest-environment node` 테스트는 SSR 환경으로 모듈을 찾으므로 여기에도 source 조건을 둔다.
  // 없으면 패키지를 빌드하기 전(새로 받은 저장소, CI의 test 단계)에 dist를 찾다가 실패한다.
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  build: {
    lib: { entry: { index: 'src/index.ts', styles: 'src/styles.css' }, formats: ['es'] },
    // CSS를 JS에서 떼어 dist/styles.css 한 파일로 낸다. 쓰는 쪽이 직접 import한다.
    cssCodeSplit: true,
    sourcemap: true,
    rolldownOptions: { external: isExternal },
  },
});
