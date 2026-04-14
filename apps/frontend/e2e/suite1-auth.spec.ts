/**
 * Suite 1 — Authentication
 * SPEC.md §26, Story 1.0, §8
 *
 * Tests the landing page sign-in flow and auth guards.
 * Uses AUTH_MODE=dev token endpoint directly via the auth fixture.
 */
import { test, expect } from './fixtures/auth.fixture';

const SCREENSHOT_DIR = 'playwright-report/screenshots/suite1-auth';

// Reset state before each test via the test API
test.beforeEach(async ({ page }) => {
  await page.request.post('/api/v1/test/reset').catch(() => {
    // reset endpoint may not respond if the test doesn't need server state
  });
});

test.describe('Suite 1 — Authentication', () => {

  test('1.1 landing page shows 5 test user options', async ({ page }) => {
    await page.goto('/');

    // Wait for the landing page to render
    await expect(page.getByRole('heading', { name: /Card Platform/i })).toBeVisible();

    // The select should contain exactly 5 test user options (SPEC.md §8)
    const select = page.getByRole('combobox', { name: /Select a test user/i });
    await expect(select).toBeVisible();

    const options = select.locator('option');
    await expect(options).toHaveCount(5);

    // Verify all 5 seeded usernames are present
    const expectedUsernames = [
      'test-player-1',
      'test-player-2',
      'test-player-3',
      'test-moderator',
      'test-admin',
    ];
    for (const username of expectedUsernames) {
      await expect(select.locator(`option[value="${username}"]`)).toHaveCount(1);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/1-landing.png` });
  });

  test('1.2 sign-in via dev token redirects to /lobby', async ({ page }) => {
    await page.goto('/');

    // Dev mode notice is shown
    await expect(page.getByText(/Development mode/i)).toBeVisible();

    // Select test-player-1 and sign in
    const select = page.getByRole('combobox', { name: /Select a test user/i });
    await select.selectOption('test-player-1');

    await page.getByRole('button', { name: /Sign In/i }).click();

    // Should redirect to /lobby
    await page.waitForURL('**/lobby');
    await expect(page).toHaveURL(/\/lobby/);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/2-after-login.png` });
  });

  test('1.3 token stored in sessionStorage after login', async ({ page }) => {
    await page.goto('/');

    const select = page.getByRole('combobox', { name: /Select a test user/i });
    await select.selectOption('test-player-1');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await page.waitForURL('**/lobby');

    // Verify the auth_token key exists in sessionStorage
    const token = await page.evaluate(() => sessionStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token!.length).toBeGreaterThan(10);

    // Verify player profile is also stored
    const playerJson = await page.evaluate(() => sessionStorage.getItem('auth_player'));
    expect(playerJson).toBeTruthy();
    const player = JSON.parse(playerJson!);
    expect(player.username).toBe('test-player-1');
  });

  test('1.4 /lobby requires auth — redirects to / when unauthenticated', async ({ page }) => {
    // Navigate directly to /lobby without any auth
    await page.goto('/lobby');

    // App should redirect back to landing page
    await page.waitForURL('**/');
    await expect(page).toHaveURL(/^http:\/\/[^/]+(\/)?$/);

    // Landing page content is visible, not lobby content
    await expect(page.getByRole('heading', { name: /Card Platform/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('1.5 /admin requires moderator role — player redirected to /lobby', async ({ getAuthedPage }) => {
    // Log in as a regular player (not moderator/admin)
    const page = await getAuthedPage('test-player-1');
    await page.goto('/lobby');
    await page.waitForURL('**/lobby');

    // Attempt to navigate to /admin
    await page.goto('/admin');

    // Regular player should be redirected — either to /lobby or shown access denied
    // SPEC.md §6: /admin requires moderator+
    // The app either redirects or shows access denied within the page
    await page.waitForTimeout(500);

    const isOnLobby = page.url().includes('/lobby');
    const hasAccessDenied = await page.getByText(/Access denied/i).isVisible().catch(() => false);

    expect(isOnLobby || hasAccessDenied).toBeTruthy();
  });

});
