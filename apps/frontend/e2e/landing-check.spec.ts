import { test, expect } from '@playwright/test';

test('landing page loads without MSAL init error', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warn' || msg.type() === 'error') {
      warnings.push(msg.text());
    }
  });
  await page.goto('http://localhost/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/landing-prod.png', fullPage: false });
  // eslint-disable-next-line no-console
  console.log('Warnings/Errors:\n', warnings.join('\n'));
  const b2cErrors = warnings.filter((w) => w.includes('B2C configuration missing'));
  expect(b2cErrors, 'no B2C init errors on landing page load').toEqual([]);
});
