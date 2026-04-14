/**
 * Playwright Auth Fixture — Unit 3
 *
 * Extends the base Playwright test with an authenticated page.
 * Calls POST /api/v1/dev/token directly (no UI login flow) and injects
 * the token into sessionStorage before each test.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/auth.fixture';
 *
 *   test('lobby loads for authenticated user', async ({ authedPage }) => {
 *     await authedPage.goto('/lobby');
 *     // page is already authenticated as test-player-1
 *   });
 *
 * Custom username:
 *   test('moderator can access admin', async ({ getAuthedPage }) => {
 *     const page = await getAuthedPage('test-moderator');
 *     await page.goto('/admin');
 *   });
 */

import { test as base, Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';
const DEFAULT_USERNAME = 'test-player-1';

interface TokenResponse {
  token: string;
  playerId: string;
  username: string;
  role: string;
}

/** Fetch a dev token for the given username directly from the API. */
async function fetchDevToken(username: string): Promise<TokenResponse> {
  const response = await fetch(`${API_URL}/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error: string };
    throw new Error(`Failed to fetch dev token for '${username}': ${body.error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

/** Inject token and player profile into the page's sessionStorage. */
async function injectAuth(page: Page, data: TokenResponse): Promise<void> {
  const playerProfile = {
    id: data.playerId,
    username: data.username,
    displayName: data.username,
    avatarUrl: null,
    role: data.role,
    createdAt: new Date().toISOString(),
  };

  await page.evaluate(
    ({ token, player, tokenKey, playerKey }) => {
      sessionStorage.setItem(tokenKey, token);
      sessionStorage.setItem(playerKey, JSON.stringify(player));
    },
    {
      token: data.token,
      player: playerProfile,
      tokenKey: 'auth_token',
      playerKey: 'auth_player',
    },
  );
}

type AuthFixtures = {
  /** A Playwright Page pre-authenticated as test-player-1 (default). */
  authedPage: Page;
  /**
   * Factory to create an authenticated page for any seeded test user.
   * @param username One of the seeded usernames (test-player-1, test-moderator, etc.)
   */
  getAuthedPage: (username: string) => Promise<Page>;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    // Navigate to root first so sessionStorage is scoped to the app origin
    await page.goto('/');
    const tokenData = await fetchDevToken(DEFAULT_USERNAME);
    await injectAuth(page, tokenData);
    await use(page);
  },

  getAuthedPage: async ({ page }, use) => {
    await use(async (username: string) => {
      await page.goto('/');
      const tokenData = await fetchDevToken(username);
      await injectAuth(page, tokenData);
      return page;
    });
  },
});

export { expect } from '@playwright/test';
