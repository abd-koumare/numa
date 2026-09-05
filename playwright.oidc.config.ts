import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-oidc',
  fullyParallel: false,
  expect: { timeout: 15_000 },
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
