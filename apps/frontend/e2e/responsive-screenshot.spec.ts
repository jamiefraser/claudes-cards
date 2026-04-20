/**
 * One-shot screenshot helper — opens a Phase 10 room at 390px and dumps
 * a screenshot. Used to verify the mobile responsive pass by eye.
 *
 * Run: E2E_BASE_URL=http://127.0.0.1:5173 API_URL=http://127.0.0.1:3001/api/v1 \
 *      npx playwright test e2e/responsive-screenshot.spec.ts --reporter=list
 */
import { test } from './fixtures/auth.fixture';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

test('capture mobile 390 Phase 10 table', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tok = await page.evaluate(() => sessionStorage.getItem('auth_token'));
  const player = await page.evaluate(() => sessionStorage.getItem('auth_player'));
  if (tok) await page.evaluate((v) => localStorage.setItem('auth_token', v), tok);
  if (player) await page.evaluate((v) => localStorage.setItem('auth_player', v), player);

  await page.request.post(`${API_URL}/test/reset`);
  const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
    data: {
      gameId: 'phase10',
      players: ['test-player-1', 'test-player-2', 'test-player-3'],
      scenario: 'phase10-start',
    },
  });
  const { roomId } = (await seedResp.json()) as { roomId: string };

  await page.goto(`/table/${roomId}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/mobile-390-phase10.png', fullPage: true });
  // eslint-disable-next-line no-console
  console.log('Screenshot saved to test-results/mobile-390-phase10.png');
});

test('capture desktop 1280 Phase 10 table (regression)', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  const tok = await page.evaluate(() => sessionStorage.getItem('auth_token'));
  const player = await page.evaluate(() => sessionStorage.getItem('auth_player'));
  if (tok) await page.evaluate((v) => localStorage.setItem('auth_token', v), tok);
  if (player) await page.evaluate((v) => localStorage.setItem('auth_player', v), player);

  await page.request.post(`${API_URL}/test/reset`);
  const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
    data: {
      gameId: 'phase10',
      players: ['test-player-1', 'test-player-2', 'test-player-3'],
      scenario: 'phase10-start',
    },
  });
  const { roomId } = (await seedResp.json()) as { roomId: string };

  await page.goto(`/table/${roomId}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/desktop-1280-phase10.png', fullPage: false });
});

test('capture mobile 360 Phase 10 table', async ({ authedPage: page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const tok = await page.evaluate(() => sessionStorage.getItem('auth_token'));
  const player = await page.evaluate(() => sessionStorage.getItem('auth_player'));
  if (tok) await page.evaluate((v) => localStorage.setItem('auth_token', v), tok);
  if (player) await page.evaluate((v) => localStorage.setItem('auth_player', v), player);

  await page.request.post(`${API_URL}/test/reset`);
  const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
    data: {
      gameId: 'phase10',
      players: ['test-player-1', 'test-player-2'],
      scenario: 'phase10-start',
    },
  });
  const { roomId } = (await seedResp.json()) as { roomId: string };

  await page.goto(`/table/${roomId}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/mobile-360-phase10.png', fullPage: true });
  // eslint-disable-next-line no-console
  console.log('Screenshot saved to test-results/mobile-360-phase10.png');
});
