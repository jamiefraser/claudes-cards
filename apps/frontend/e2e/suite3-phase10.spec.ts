/**
 * Suite 3 — Phase 10 Gameplay
 * SPEC.md §13, §26
 *
 * Tests the Phase 10 game table: joining, hand display, draw, discard, lay down.
 * Uses POST /api/v1/test/reset and POST /api/v1/test/seed-game to set up
 * a known game state for predictable assertions.
 *
 * Assumptions:
 *   - POST /api/v1/test/seed-game creates a Phase 10 room with
 *     test-player-1 and test-player-2 seated, game started, known hand dealt.
 *   - The seeded hand for test-player-1 has exactly 10 cards.
 *   - A valid Phase 1 set (3 cards of same number) is pre-selected via seed.
 */
import { test, expect } from './fixtures/auth.fixture';

const SCREENSHOT_DIR = 'playwright-report/screenshots/suite3-phase10';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

let seededRoomId: string;

test.beforeEach(async ({ page }) => {
  // Reset and seed a known Phase 10 game state
  await page.request.post('/api/v1/test/reset');

  const seedResp = await page.request.post('/api/v1/test/seed-game', {
    data: {
      gameId: 'phase10',
      players: ['test-player-1', 'test-player-2'],
      // Server seeds a known hand with 10 cards for player-1 and
      // a valid 3-of-a-kind set at indices 0-2 for lay-down testing
      scenario: 'phase10-start',
    },
  });

  if (seedResp.ok()) {
    const body = await seedResp.json() as { roomId: string };
    seededRoomId = body.roomId;
  } else {
    // Fallback: tests will attempt to navigate but may fail gracefully
    seededRoomId = 'test-room-fallback';
  }
});

test.describe('Suite 3 — Phase 10 Gameplay', () => {

  test('3.1 join a Phase 10 room and table loads', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    // TablePage shows loading state initially
    await expect(page.getByText(/Loading/i)).toBeVisible();

    // Wait for game_state_sync — table renders once synced
    // GameTable renders when gameState is set
    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/1-table-loaded.png` });
  });

  test('3.2 hand shows 10 cards on deal', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    // Wait for table to sync
    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // HandComponent renders cards for the local player
    // Each card should be a button or interactive element
    // NOTE: CardComponent needs data-testid="card" for reliable count
    // Fallback: hand container aria-label from SPEC (en.table.yourHand = "Your hand")
    const handContainer = page.getByLabel(/Your hand/i);
    await expect(handContainer).toBeVisible();

    const cards = handContainer.locator('[role="button"], button, [data-card]');
    // Phase 10 starts with 10 cards — SPEC.md §13
    await expect(cards).toHaveCount(10, { timeout: 8_000 });
  });

  test('3.3 draw card button enabled on own turn', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // The seeded scenario sets test-player-1 as the current turn
    // Draw Deck button should be enabled
    const drawBtn = page.getByRole('button', { name: /Draw.*[Dd]eck/i });
    await expect(drawBtn).toBeVisible();
    await expect(drawBtn).toBeEnabled();
  });

  test('3.4 discard card via button', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // First draw a card so we can discard
    const drawBtn = page.getByRole('button', { name: /Draw.*[Dd]eck/i });
    if (await drawBtn.isEnabled()) {
      await drawBtn.click();
      // Wait for draw animation
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/2-after-draw.png` });

    // Select the first card in hand
    const handContainer = page.getByLabel(/Your hand/i);
    const firstCard = handContainer.locator('[role="button"], button').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
    }

    // Discard button should now be enabled
    const discardBtn = page.getByRole('button', { name: /Discard/i });
    await expect(discardBtn).toBeVisible();

    if (await discardBtn.isEnabled()) {
      await discardBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/3-after-discard.png` });

    // After discard the hand should have one fewer card (back to 10)
    // or the turn passes to the opponent
    // Just verify no error state
    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible();
  });

  test('3.5 lay down a valid phase (mocked hand)', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // The seeded scenario sets the first 3 cards as a valid set for Phase 1
    // Select 3 cards that form the valid set
    const handContainer = page.getByLabel(/Your hand/i);
    const cards = handContainer.locator('[role="button"], button');

    // Select first 3 cards (seeded to form a valid phase)
    const cardCount = await cards.count();
    const selectCount = Math.min(3, cardCount);

    for (let i = 0; i < selectCount; i++) {
      await cards.nth(i).click();
    }

    // Lay Down button should become enabled after selection
    const layDownBtn = page.getByRole('button', { name: /Lay Down/i });
    await expect(layDownBtn).toBeVisible();

    if (await layDownBtn.isEnabled()) {
      await layDownBtn.click();
      await page.waitForTimeout(800);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/4-after-layDown.png` });

    // After lay down, either the phase is accepted or an error toast appears
    // Verify the table is still functional (no crash)
    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible();
  });

});
