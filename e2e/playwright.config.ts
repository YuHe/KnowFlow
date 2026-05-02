import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // Test directory
  testDir: './tests',

  // Run tests in files in parallel
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for all tests
    baseURL: process.env.BASE_URL || 'http://localhost:8192',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Save screenshots only on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',

    // Reasonable timeout per action
    actionTimeout: 10_000,

    // Navigation timeout
    navigationTimeout: 30_000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Global timeout per test
  timeout: 60_000,

  // Output folder for test artifacts
  outputDir: 'test-results',
})
