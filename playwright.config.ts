import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/helpers/global-setup.ts',
  fullyParallel: false,
  retries: 2,
  workers: 1,
  reporter: 'html',
  timeout: 30000,

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://training-diary.web.app',
    storageState: 'tests/fixtures/auth-state.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
