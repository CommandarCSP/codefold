import { defineConfig, devices } from '@playwright/test';

// 다른 프로젝트의 개발 서버가 5173을 쓰고 있으면 E2E_PORT로 바꾼다(재사용하면 엉뚱한 앱을 검사한다).
const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  // 자동 저장은 실제 IndexedDB 쓰기를 기다린다. 기본 5초는 WebKit에서 가끔 부족해 넉넉히 둔다.
  expect: { timeout: 10_000 },
  // DecompressionStream 등 브라우저 내장 기능을 엔진마다 확인한다 (ADR-0013)
  // devices['Desktop Chrome']·devices['Desktop Firefox']는 UA를 Windows로 꾸민다. Monaco는 그 UA로
  // OS를 가늠해 Undo 단축키를 고르므로(맥에서 실행해도 Ctrl+Z를 기대하게 된다), 실제 브라우저 UA를
  // 그대로 쓰도록 뺀다 — ADR-0013이 원하는 "엔진 그대로" 확인과도 맞는다.
  projects: (
    [
      ['chromium', devices['Desktop Chrome']],
      ['firefox', devices['Desktop Firefox']],
      ['webkit', devices['Desktop Safari']],
    ] as const
  ).map(([name, preset]) => ({ name, use: { ...preset, userAgent: undefined } })),
  webServer: {
    // 빌드 결과로 돈다. 개발 서버는 처음 동적 import할 때 의존성을 새로 묶으며 페이지를 다시 불러올 수 있고,
    // 첫 화면에 Monaco·dockview가 없는지도 실제 청크로 확인해야 한다.
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
