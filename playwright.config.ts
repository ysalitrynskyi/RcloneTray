import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  use: {
    trace: 'on-first-retry',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ],
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.e2e.ts',
    }
  ],
})

