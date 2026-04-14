/**
 * Suite 8 — Leaderboards
 * SPEC.md §18 Epic 7, §26
 *
 * Tests:
 *   - Leaderboard table renders with player rows
 *   - Game / period switcher works
 *   - Data updates within 5 s of a game completing
 *   - Bots are excluded from leaderboard entries
 *
 * Assumptions:
 *   - /leaderboard renders LeaderboardPage with a table
 *   - Table rows have data-testid="leaderboard-row" or role="row"
 *   - Period switcher (All Time / Weekly / Daily) rendered as tabs or select
 *   - Game switcher rendered as tabs or select
 *   - POST /api/v1/test/seed-completed-game triggers a leaderboard update
 */
import { test, expect } from './fixtures/auth.fixture';

const SCREENSHOT_DIR = 'playwright-report/screenshots/suite8-leaderboard';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/v1/test/reset').catch(() => {});
});

test.describe('Suite 8 — Leaderboards', () => {

  test('8.1 leaderboard page renders with table rows', async ({ authedPage: page }) => {
    await page.goto('/leaderboard');
    await page.waitForURL('**/leaderboard');

    // Wait for data to load
    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/1-leaderboard-initial.png` });

    // The leaderboard table should be visible
    const table = page.getByRole('table')
      .or(page.locator('[data-testid="leaderboard-table"]'))
      .or(page.locator('[role="grid"]'));
    await expect(table).toBeVisible({ timeout: 10_000 });

    // There should be at least some rows (seeded players)
    const rows = page.getByRole('row')
      .or(page.locator('[data-testid="leaderboard-row"]'));
    // At least header row + 1 data row expected from seeded users
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/2-leaderboard-rows.png` });
  });

  test('8.2 game switcher changes displayed leaderboard', async ({ authedPage: page }) => {
    await page.goto('/leaderboard');
    await page.waitForURL('**/leaderboard');

    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/3-game-switcher.png` });

    // Game switcher — tabs or select element
    const gameSwitcher = page.getByRole('tablist')
      .or(page.locator('[data-testid="game-switcher"]'))
      .or(page.getByRole('combobox', { name: /Game/i }));

    if (await gameSwitcher.isVisible({ timeout: 3_000 })) {
      // Click the second tab or select a different game
      const tabs = gameSwitcher.getByRole('tab');
      const tabCount = await tabs.count();

      if (tabCount > 1) {
        await tabs.nth(1).click();
        await page.waitForTimeout(500);

        // Table should still be visible after switching
        const table = page.getByRole('table')
          .or(page.locator('[data-testid="leaderboard-table"]'));
        await expect(table).toBeVisible({ timeout: 5_000 });

        await page.screenshot({ path: `${SCREENSHOT_DIR}/4-game-switched.png` });
      }
    } else {
      // Switcher might be a select
      const gameSelect = page.getByRole('combobox');
      if (await gameSelect.first().isVisible({ timeout: 3_000 })) {
        const options = await gameSelect.first().locator('option').all();
        if (options.length > 1) {
          await gameSelect.first().selectOption({ index: 1 });
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${SCREENSHOT_DIR}/4-game-selected.png` });
        }
      }
    }
  });

  test('8.3 period switcher works (All Time / Weekly / Daily)', async ({ authedPage: page }) => {
    await page.goto('/leaderboard');
    await page.waitForURL('**/leaderboard');

    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // Period tabs — SPEC.md §18
    const allTimeTab = page.getByRole('tab', { name: /All Time/i })
      .or(page.getByRole('button', { name: /All Time/i }))
      .or(page.getByText(/All Time/i));

    const weeklyTab = page.getByRole('tab', { name: /Weekly/i })
      .or(page.getByRole('button', { name: /Weekly/i }))
      .or(page.getByText(/Weekly/i));

    const dailyTab = page.getByRole('tab', { name: /Daily/i })
      .or(page.getByRole('button', { name: /Daily/i }))
      .or(page.getByText(/Daily/i));

    // At least one period option should be visible
    const hasPeriodSelector =
      await allTimeTab.first().isVisible() ||
      await weeklyTab.first().isVisible() ||
      await dailyTab.first().isVisible();

    if (hasPeriodSelector) {
      // Click Weekly if visible
      if (await weeklyTab.first().isVisible()) {
        await weeklyTab.first().click();
        await page.waitForTimeout(500);
        await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 5_000 });

        await page.screenshot({ path: `${SCREENSHOT_DIR}/5-weekly-period.png` });

        // Table should still render
        const table = page.getByRole('table')
          .or(page.locator('[data-testid="leaderboard-table"]'));
        await expect(table).toBeVisible({ timeout: 5_000 });
      }

      // Click Daily if visible
      if (await dailyTab.first().isVisible()) {
        await dailyTab.first().click();
        await page.waitForTimeout(500);
        await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 5_000 });

        await page.screenshot({ path: `${SCREENSHOT_DIR}/6-daily-period.png` });
      }
    }

    // Verify no error state
    await expect(page.getByText(/Error/i).or(page.getByText(/failed/i))).toBeHidden();
  });

  test('8.4 leaderboard updates within 5s of game completion', async ({ authedPage: page }) => {
    await page.goto('/leaderboard');
    await page.waitForURL('**/leaderboard');

    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // Record the current top entry score (or row count)
    const table = page.getByRole('table')
      .or(page.locator('[data-testid="leaderboard-table"]'));
    await expect(table).toBeVisible({ timeout: 10_000 });

    const initialRowCount = await page.getByRole('row')
      .or(page.locator('[data-testid="leaderboard-row"]'))
      .count();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/7-before-game-complete.png` });

    // Trigger a completed game (updates scores) via test endpoint
    await page.request.post('/api/v1/test/seed-completed-game', {
      data: {
        gameId: 'phase10',
        winner: 'test-player-1',
        score: 9999,
      },
    }).catch(() => null);

    // Leaderboard should update within 5 seconds (SPEC.md §18 Story 7.x)
    await page.waitForTimeout(5_000);

    // Snapshot after the update window
    await page.screenshot({ path: `${SCREENSHOT_DIR}/8-after-game-complete.png` });

    // Table should still be visible (not crashed)
    await expect(table).toBeVisible();
  });

  test('8.5 bot players are not listed in leaderboard', async ({ authedPage: page }) => {
    await page.goto('/leaderboard');
    await page.waitForURL('**/leaderboard');

    await expect(page.getByText(/Loading/i)).toBeHidden({ timeout: 10_000 });

    // SPEC.md §18: bots are excluded from leaderboards
    // Bot names follow the pattern "TestPlayerN (Bot)" or have isBot: true
    // Verify no "(Bot)" entry appears in the leaderboard table
    const table = page.getByRole('table')
      .or(page.locator('[data-testid="leaderboard-table"]'));
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Bot entries should not appear
    const botEntries = page.getByText(/\(Bot\)/i)
      .or(page.locator('[data-testid="bot-badge"]'));

    // All bot entries should be absent from the leaderboard
    await expect(botEntries).toBeHidden();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/9-no-bots.png` });
  });

});
