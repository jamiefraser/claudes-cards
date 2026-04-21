/**
 * Token expiry resilience — verifies the user is not bounced to an
 * authentication error when their stored JWT has expired. The frontend
 * should silently refresh and let the navigation succeed.
 *
 * Repro:
 *   1. Authenticate as test-player-1 to obtain a token + player profile.
 *   2. Replace the stored token with an artificially-expired JWT.
 *   3. Navigate to /lobby (an authenticated route that hits /api/v1/rooms).
 *   4. Assert: page loads without surfacing an auth error and a fresh
 *      token has been written to localStorage by the time we read it.
 */
import { test, expect } from './fixtures/auth.fixture';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

/** Build a JWT-shaped string that's already expired. */
function makeExpiredJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'test',
    username: 'test-player-1',
    exp: Math.floor(Date.now() / 1000) - 3600, // 1h ago
  }));
  return `${header}.${payload}.fakesig`;
}

test('expired token is auto-refreshed without surfacing an auth error', async ({ authedPage: page }) => {
  // The auth fixture already issued a real dev token + player profile.
  // Mirror it into localStorage (the auth provider reads localStorage),
  // then poison the token with one that's already expired.
  const realToken = await page.evaluate(() => sessionStorage.getItem('auth_token'));
  const realPlayer = await page.evaluate(() => sessionStorage.getItem('auth_player'));
  if (realToken) await page.evaluate((v) => localStorage.setItem('auth_token', v), realToken);
  if (realPlayer) await page.evaluate((v) => localStorage.setItem('auth_player', v), realPlayer);

  await page.evaluate((expired) => {
    localStorage.setItem('auth_token', expired);
  }, makeExpiredJwt());

  // Capture warnings/errors so we can assert nothing auth-related leaks
  // into the console.
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warn' || msg.type() === 'error') {
      warnings.push(msg.text());
    }
  });

  // Navigate to an authenticated route. The first /api request will get
  // a 401, the client should refresh + retry transparently, and the page
  // should render normally.
  await page.goto('/lobby');
  await page.waitForLoadState('networkidle');

  // The auth provider should have either written a fresh token or sent
  // us back to '/' with a re-auth toast. The first is the success path.
  const tokenAfter = await page.evaluate(() => localStorage.getItem('auth_token'));
  expect(tokenAfter, 'token rotated after silent refresh').not.toBe(makeExpiredJwt());
  expect(tokenAfter, 'fresh token present').toBeTruthy();

  // No re-auth event should have hit the user.
  const reauthErrors = warnings.filter((w) => w.includes('Session expired'));
  expect(reauthErrors).toEqual([]);

  // We should still be on the lobby (not redirected to /).
  expect(page.url()).toMatch(/\/lobby/);
});
