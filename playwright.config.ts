import { defineConfig, devices } from '@playwright/test'

/**
 * Browser smoke tests (e2e/). Each test gets a fresh browser profile, so the
 * app seeds its demo campaign ("Welcome to StarTome") and the tests run on
 * that; your own data in your browser is never touched. They use the dev
 * server on 3001: a running `pnpm dev` is reused (Nuxt allows one dev server
 * per project), else one is started.
 *
 *   pnpm test:e2e            run headless
 *   pnpm test:e2e --ui       watch and step through
 */
const PORT = 3001

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'pnpm dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
  },
})
