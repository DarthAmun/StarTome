import { defineConfig, devices } from '@playwright/test'

/** Browser tests of the rework app (src/). Every test starts with an empty browser profile. */
export default defineConfig({
  testDir: './e2e',
  // GitHub's runner is about 3.5× slower than the laptop (the encounter tests take 8–10 s here, 27–35 s there)
  timeout: process.env.CI ? 90_000 : 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: { baseURL: 'http://localhost:3001', testIdAttribute: 'data-test', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'pnpm dev', url: 'http://localhost:3001', reuseExistingServer: !process.env.CI, timeout: 60_000 },
})
