import { defineConfig, devices } from '@playwright/test';

// 성능 측정(ADR-0027). E2E와 따로 돈다: 한 번에 하나씩, Chromium에서만 잰다.
// Long Tasks API는 Chromium만 지원하고, 기준 환경(ADR-0027)도 Chromium이다.
const port = Number(process.env.PERF_PORT ?? 4174);

export default defineConfig({
  testDir: './perf',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], userAgent: undefined } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
