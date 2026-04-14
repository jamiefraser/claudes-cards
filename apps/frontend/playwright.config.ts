/**
 * Playwright configuration for Card Platform E2E tests.
 * Tests run against docker-compose.test.yml (nginx on port 80).
 * SPEC.md §26
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  // Generous per-test timeout — Suite 9 has a 7-checkpoint bot lifecycle that
  // naturally chains multiple waits. 90s allows for browser context setup per viewport.
  timeout: 90_000,

  // Do not run tests in parallel — some suites share state via the test API
  fullyParallel: false,

  // Fail the build on CI if test.only is left in source
  forbidOnly: !!process.env.CI,

  // Retry once on CI to reduce flakiness from container startup timing
  retries: process.env.CI ? 1 : 0,

  // Single worker — fullyParallel is false
  workers: 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    // nginx reverse-proxy — `cards-ui` container publishes 80 \u2192 host 8080.
    // 127.0.0.1 (not 'localhost') avoids Node's IPv6-first resolution stalling.
    baseURL:
      process.env.E2E_BASE_URL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      'http://127.0.0.1:8080',

    // Capture screenshot on every test failure
    screenshot: 'only-on-failure',

    // Capture trace on retry
    trace: 'on-first-retry',

    // Give each action a generous timeout against a cold Docker stack
    actionTimeout: 10_000,
  },

  expect: {
    // Global assertion timeout
    timeout: 5_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
