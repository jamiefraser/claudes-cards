/**
 * tokenRefresh — proactive token renewal before expiry.
 * SPEC.md §20 Story 9.2 (Connection Resilience)
 *
 * Dev mode: refreshes dev token 30 min before 8h expiry (at 7h30m).
 * Production mode: triggers silent MSAL renewal.
 *
 * On failure: dispatches 'auth:reauth-required' event for UI to show re-auth modal.
 * AUTH_MODE guard: dev token refresh is only active in AUTH_MODE=dev.
 */

import { logger } from '@/utils/logger';

const TOKEN_KEY = 'auth_token';
const PLAYER_KEY = 'auth_player';
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

/** How many ms before token expiry to trigger a refresh (30 minutes). */
const REFRESH_BEFORE_EXPIRY_MS = 30 * 60 * 1000;

/** Estimated token lifetime for dev tokens (8 hours). */
const DEV_TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Parse the token exp claim without a full JWT library. */
function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!)) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000; // convert to ms
  } catch {
    return null;
  }
}

/** Dispatch the re-auth required event so the UI can show a login modal. */
function emitReauthRequired(): void {
  logger.warn('tokenRefresh: emitting auth:reauth-required');
  window.dispatchEvent(new CustomEvent('auth:reauth-required'));
}

/** Perform a dev token refresh by re-posting the stored username to /dev/token. */
async function refreshDevToken(): Promise<void> {
  const storedPlayer = sessionStorage.getItem(PLAYER_KEY);
  if (!storedPlayer) {
    logger.warn('tokenRefresh: no stored player; cannot refresh');
    emitReauthRequired();
    return;
  }

  let username: string;
  try {
    const player = JSON.parse(storedPlayer) as { username?: string };
    username = player.username ?? '';
  } catch {
    emitReauthRequired();
    return;
  }

  if (!username) {
    emitReauthRequired();
    return;
  }

  try {
    const response = await fetch(`${API_URL}/dev/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { token: string };
    sessionStorage.setItem(TOKEN_KEY, data.token);
    logger.info('tokenRefresh: dev token refreshed successfully');

    // Schedule the next refresh
    scheduleRefresh(data.token);
  } catch (err) {
    logger.error('tokenRefresh: refresh failed', { err });
    emitReauthRequired();
  }
}

/** Schedule a token refresh based on the token's exp claim or fallback lifetime. */
export function scheduleRefresh(token: string): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const expiryMs = getTokenExpiryMs(token);
  const now = Date.now();

  let delayMs: number;
  if (expiryMs !== null) {
    delayMs = expiryMs - now - REFRESH_BEFORE_EXPIRY_MS;
  } else {
    // Fallback: assume token was just issued with DEV_TOKEN_LIFETIME_MS lifetime
    delayMs = DEV_TOKEN_LIFETIME_MS - REFRESH_BEFORE_EXPIRY_MS;
  }

  if (delayMs <= 0) {
    // Token already near expiry — refresh immediately
    logger.info('tokenRefresh: token near expiry, refreshing immediately');
    void refreshDevToken();
    return;
  }

  logger.info(`tokenRefresh: scheduling refresh in ${Math.round(delayMs / 1000 / 60)}m`);

  refreshTimer = setTimeout(() => {
    const authMode = import.meta.env.VITE_AUTH_MODE ?? 'dev';
    if (authMode === 'dev') {
      void refreshDevToken();
    } else {
      // Production: delegate to MSAL silent renewal
      // The MSAL provider handles silent token acquisition automatically.
      // If it fails, MSAL fires an event that triggers re-auth.
      logger.info('tokenRefresh: production mode — MSAL handles silent renewal');
    }
  }, delayMs);
}

/** Cancel any pending refresh timer (e.g. on logout). */
export function cancelRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    logger.info('tokenRefresh: scheduled refresh cancelled');
  }
}

/** Initialize the refresh scheduler from the current session token. */
export function initTokenRefresh(): void {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return;
  scheduleRefresh(token);
}
