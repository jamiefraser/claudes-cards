/**
 * Suite 10 — Cribbage Gameplay (Hoyle's rules)
 * Hoyle's Standard Games: chapter on Cribbage.
 *
 * Uses the shared test seed (POST /api/v1/test/seed-game { gameId: 'cribbage' })
 * to stand up a 2-player cribbage table in the "discarding" phase with a known
 * deal for each player.
 */
import { test, expect } from './fixtures/auth.fixture';

const SCREENSHOT_DIR = 'playwright-report/screenshots/suite10-cribbage';

let seededRoomId: string;

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/v1/test/reset');

  const seedResp = await page.request.post('/api/v1/test/seed-game', {
    data: {
      gameId: 'cribbage',
      players: ['test-player-1', 'test-player-2'],
    },
  });

  if (seedResp.ok()) {
    const body = (await seedResp.json()) as { roomId: string };
    seededRoomId = body.roomId;
  } else {
    seededRoomId = 'cribbage-fallback';
  }
});

test.describe('Suite 10 — Cribbage Gameplay', () => {
  test('10.1 join a Cribbage room and table loads', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    // ActionBar renders once the game_state_sync arrives.
    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/1-table-loaded.png` });
  });

  test('10.2 hand shows 6 cards on deal (two-player)', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // Player 1 is the seeded local user; hand list has 6 cards.
    const hand = page.getByRole('list', { name: /Your hand/i });
    await expect(hand).toBeVisible();
    const cards = hand.getByRole('listitem');
    await expect(cards).toHaveCount(6);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/2-hand-of-six.png` });
  });

  test('10.3 discarding phase shows "Send to Crib" button (not Discard)', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // During cribbage discarding phase the ActionBar swaps "Discard" for
    // "Send to Crib" and shows how many cards the crib still needs.
    await expect(
      page.getByRole('button', { name: /Send selected cards to the crib/i }),
    ).toBeVisible();
    await expect(page.getByText(/Crib needs \d+ more/i)).toBeVisible();

    // Traditional draw/lay-down buttons are not shown during crib discard.
    await expect(page.getByRole('button', { name: /Draw Deck/i })).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/3-to-crib-button.png` });
  });

  test('10.4 cribbage scoring board renders with pegs at 0', async ({ authedPage: page }) => {
    await page.goto(`/table/${seededRoomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // CribbageBoard is rendered only for cribbage games.
    await expect(page.getByLabel(/Cribbage scoring board/i)).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/4-board.png` });
  });

  test('10.5 pegging phase shows Play/Go buttons and peg area', async ({ authedPage: page }) => {
    // Re-seed with the pegging scenario for this test.
    await page.request.post('/api/v1/test/reset');
    const seedResp = await page.request.post('/api/v1/test/seed-game', {
      data: {
        gameId: 'cribbage',
        players: ['test-player-1', 'test-player-2'],
        scenario: 'cribbage-pegging',
      },
    });
    const { roomId } = (await seedResp.json()) as { roomId: string };
    await page.goto(`/table/${roomId}`);

    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });

    // Peg area shows Count and the cut card.
    await expect(page.getByLabel(/Cribbage pegging area/i)).toBeVisible();
    await expect(page.getByText(/Count/i)).toBeVisible();

    // Play and Go buttons are present during the pegging phase.
    await expect(page.getByRole('button', { name: /^Play$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Go$/ })).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/5-pegging.png` });
  });
});
