import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    // 레포 안에서는 워크스페이스 패키지의 src를 바로 읽는다 (ADR-0005)
    conditions: ['source', ...defaultClientConditions],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // `// @vitest-environment node` 테스트는 SSR 환경으로 모듈을 찾으므로 여기에도 source 조건을 둔다.
  // 없으면 패키지를 빌드하기 전(새로 받은 저장소, CI의 test 단계)에 dist를 찾다가 실패한다.
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  worker: { format: 'es' },
  // 지원 브라우저(Chrome·Edge·Firefox·Safari 최신 두 버전, ADR-0030)는 모두 ES2023 문법을 그대로 돌린다.
  // tsconfig의 target(es2023)과 같게 두어, 소스에 없는 변환이나 폴리필이 끼지 않게 한다.
  // manifest는 첫 화면 번들 검사(scripts/check-bundle.mjs)가 엔트리의 정적 import만 따라가려고 남긴다.
  build: { target: 'es2023', manifest: true },
});
