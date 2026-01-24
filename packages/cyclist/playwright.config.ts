/**
 * Playwright E2E Test Configuration
 *
 * Supports both web server mode and Electron app testing.
 *
 * Usage:
 *   npm run test:e2e          # Run all E2E tests
 *   npm run test:e2e:web      # Web mode only
 *   npm run test:e2e:electron # Electron mode only
 *   npm run test:e2e:ui       # Interactive UI mode
 *   npm run test:e2e:debug    # Debug mode with trace viewer
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.CYCLIST_PORT || 1900;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Test file pattern
  testMatch: '**/*.e2e.ts',

  // Timeout for each test
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if test.only is left in source
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: BASE_URL,

    // Collect trace when retrying a failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',
  },

  // Configure projects for different browsers/modes
  projects: [
    // Web mode tests - Chromium
    {
      name: 'web-chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Web mode tests - Firefox
    {
      name: 'web-firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },

    // Web mode tests - Safari
    {
      name: 'web-webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },

    // Mobile viewport tests
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],

  // Web server configuration - starts Cyclist before tests
  webServer: {
    command: 'npm run dev:web',
    url: BASE_URL,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    env: {
      CYCLIST_DEV_WEB: '1',
      CYCLIST_PROJECT_DIR: process.cwd(),
      OTEL_DEBUG: 'true',
    },
  },

  // Output directory for test artifacts
  outputDir: './e2e-results',
});
