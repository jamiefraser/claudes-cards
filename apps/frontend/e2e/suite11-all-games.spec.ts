/**
 * Suite 11 \u2014 every game in the lobby
 *
 * For each game currently registered in the platform, create a room via the
 * REST API, navigate to the table URL, and assert that the socket connects
 * and the waiting-room UI renders. This is a smoke-level E2E that covers the
 * join + room-meta pipeline for every game.
 *
 * Games marked NOT_IN_HOYLES are included for completeness; the engine-level
 * rules for them come from other sources (folk card games).
 */
import { test, expect } from './fixtures/auth.fixture';

const SCREENSHOT_DIR = 'playwright-report/screenshots/suite11-all-games';

// Use the same gameId strings the DB seed / lobby catalogue exposes \u2014 the
// kebab-case forms go through the registry's alias normalization.
const GAMES = [
  { id: 'hearts',        maxPlayers: 4 },
  { id: 'spades',        maxPlayers: 4 },
  { id: 'euchre',        maxPlayers: 4 },
  { id: 'whist',         maxPlayers: 4 },
  { id: 'oh-hell',       maxPlayers: 4 },
  { id: 'go-fish',       maxPlayers: 4 },
  { id: 'crazy-eights',  maxPlayers: 4 },
  { id: 'gin-rummy',     maxPlayers: 2 },
  { id: 'rummy',         maxPlayers: 4 },
  { id: 'canasta',       maxPlayers: 4 },
  { id: 'war',           maxPlayers: 2 },
  { id: 'idiot',         maxPlayers: 4 },
  { id: 'spit',          maxPlayers: 2 },
];

test.describe('Suite 11 \u2014 every game loads its waiting room', () => {
  for (const game of GAMES) {
    test(`11.${game.id} \u2014 create room + navigate + waiting-room loads`, async ({
      authedPage: page,
    }) => {
      // Reset deterministic test data.
      await page.request.post('/api/v1/test/reset');

      // Create a room via the REST API.
      const token = await page.evaluate(() => sessionStorage.getItem('auth_token'));
      const createResp = await page.request.post('/api/v1/rooms', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          gameId: game.id,
          name: `E2E ${game.id} room`,
          settings: {
            maxPlayers: game.maxPlayers,
            asyncMode: false,
            turnTimerSeconds: null,
            isPrivate: false,
          },
        },
      });
      expect(createResp.ok()).toBeTruthy();
      const room = (await createResp.json()) as { id: string };

      // Navigate to the table URL.
      await page.goto(`/table/${room.id}`);

      // The waiting room renders with a Start Game button (host is this user).
      await expect(page.getByRole('button', { name: /Start Game/i })).toBeVisible({
        timeout: 15_000,
      });

      await page.screenshot({ path: `${SCREENSHOT_DIR}/${game.id}.png` });
    });
  }

  // Regression test for the "No engine registered for gameId: gin-rummy" error:
  // actually kick the Start Game flow for a kebab-case game and assert the
  // game table renders (i.e. the socket-service accepted the gameId).
  test("11.start-gin-rummy \u2014 kebab-case gameId resolves to engine (regression)", async ({
    authedPage: page,
  }) => {
    await page.request.post('/api/v1/test/reset');
    const token = await page.evaluate(() => sessionStorage.getItem('auth_token'));
    const createResp = await page.request.post('/api/v1/rooms', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        gameId: 'gin-rummy',
        name: 'Regression gin-rummy',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false },
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const room = (await createResp.json()) as { id: string };

    await page.goto(`/table/${room.id}`);
    await expect(page.getByRole('button', { name: /Start Game/i })).toBeVisible({ timeout: 15_000 });

    // Click Start \u2014 host is alone, modal prompts for \u22651 bot.
    await page.getByRole('button', { name: /Start Game/i }).click();

    // BotPickerModal opens with a Start Game button inside. Scope to the
    // dialog so we don't hit the background button (which the modal covers).
    const dialog = page.getByRole('dialog', { name: /Add bots/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole('button', { name: /Start Game/i }).click();

    // Once the socket-service applies start_game the table (ActionBar)
    // replaces the waiting room.
    await expect(page.getByRole('toolbar', { name: /Game actions/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
