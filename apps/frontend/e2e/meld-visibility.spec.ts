/**
 * Captures the Phase 10 meld area after a few hit-melds have happened
 * so we can confirm visually that every card stays rendered.
 */
import { test } from './fixtures/auth.fixture';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

test('Phase 10 melds with hits — all cards visible', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  const tok = await page.evaluate(() => sessionStorage.getItem('auth_token'));
  const player = await page.evaluate(() => sessionStorage.getItem('auth_player'));
  if (tok) await page.evaluate((v) => localStorage.setItem('auth_token', v), tok);
  if (player) await page.evaluate((v) => localStorage.setItem('auth_player', v), player);

  await page.request.post(`${API_URL}/test/reset`);
  const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
    data: { gameId: 'phase10', players: ['test-player-1', 'test-player-2'], scenario: 'phase10-start' },
  });
  const { roomId } = (await seedResp.json()) as { roomId: string };
  // Bot the opponent so we just observe.
  await page.request.post(`${API_URL}/test/force-bot-activate`, {
    data: { roomId, playerId: 'test-player-2' },
  });
  // Bot the local human too — easiest way to drive a full lay-down +
  // hit-meld chain without manual UI clicks.
  await page.request.post(`${API_URL}/test/force-bot-activate`, {
    data: { roomId, playerId: 'test-player-1' },
  });

  await page.goto(`/table/${roomId}`);
  // Let the bots play several turns including lay-down + hits.
  await page.waitForTimeout(15_000);
  await page.screenshot({ path: 'test-results/phase10-melds-after-hits.png', fullPage: false });
});
