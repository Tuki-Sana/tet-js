// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testIgnore: '**/mobile/**',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'firefox',
      testIgnore: '**/mobile/**',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      testMatch: '**/mobile/**/*.spec.js',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npx serve . -l 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
