/**
 * tokenRefresh — proactive token renewal before expiry, plus a reactive
 * helper used by apiFetch / sockets when the server returns 401.
 *
 * Two refresh paths:
 *  1. Proactive: a timer scheduled at `expiry - REFRESH_BEFORE_EXPIRY_MS`
 *     calls `refreshToken()` automatically. Started by the auth provider
 *     after login or when restoring a session from localStorage.
 *  2. Reactive: `apiFetch` calls `refreshToken()` on a 401 response and
 *     retries the request once; the socket `useSocket` hook reconnects
 *     with the new token.
 *
 * On a hard refresh failure (no stored player, refresh endpoint rejects),
 * we dispatch `auth:reauth-required`. App.tsx listens and forces logout +
 * redirect to the landing page so the user re-authenticates.
 *
 * AUTH_MODE guard: dev token refresh re-posts the stored username to
 * /dev/token. Production mode delegates to MSAL silent renewal (an MSAL
 * provider that's wired correctly will refresh on its own without us
 * doing anything; we just emit reauth-required if we can't recover).
 */

import { logger } from '@/utils/logger';

const TOKEN_KEY = 'auth_token';
const PLAYER_KEY = 'auth_player';
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE as string | undefined) ?? 'dev';

/** How many ms before token expiry to trigger a proactive refresh (5 minutes). */
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

/** Estimated token lifetime when we can't parse `exp` (8 hours). */
const DEV_TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

/** Cap a runaway scheduling delay so a malformed token can't park the
 *  timer for years. */
const MAX_REFRESH_DELAY_MS = 24 * 60 * 60 * 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Listeners notified whenever the token successfully refreshes. The socket
 * hook uses this to drop and reopen its connection so the new token is
 * sent in the auth handshake.
 */
type TokenChangeListener = (newToken: string) => void;
const tokenChangeListeners = new Set<TokenChangeListener>();

export function subscribeToTokenChanges(listener: TokenChangeListener): () => void {
  tokenChangeListeners.add(listener);
  return () => tokenChangeListeners.delete(listener);
}

function notifyTokenChange(newToken: string): void {
  for (const listener of tokenChangeListeners) {
    try {
      listener(newToken);
    } catch (err) {
      logger.warn('tokenRefresh: token-change listener threw', { err });
    }
  }
}

/** Parse the token's exp claim (epoch seconds) → ms, or null on parse failure. */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!)) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/** True if the token is expired or expires within `withinMs` (default 0). */
export function isTokenExpired(token: string, withinMs = 0): boolean {
  const exp = getTokenExpiryMs(token);
  if (exp === null) return false; // unparseable — let the server be the judge
  return exp - Date.now() <= withinMs;
}

/** Dispatch the re-auth required event. App.tsx listens. */
function emitReauthRequired(): void {
  logger.warn('tokenRefresh: emitting auth:reauth-required');
  window.dispatchEvent(new CustomEvent('auth:reauth-required'));
}

/**
 * In-flight refresh dedupe. If apiFetch and the proactive timer fire
 * concurrent refreshes, we want only ONE network round-trip; the second
 * caller awaits the first's result. Without this, two parallel 401s
 * would each kick off their own refresh and clobber one another.
 */
let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Refresh the auth token and return the new token (null on failure).
 * Idempotent under concurrent callers — they share the same in-flight
 * request. Updates localStorage and notifies token-change listeners on
 * success.
 */
export async function refreshToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      if (AUTH_MODE !== 'dev') {
        // Production path: MSAL handles silent renewal on its own. If we
        // ever hit this path with no fresh token in localStorage, emit
        // reauth-required so the UI prompts the user to log in again.
        logger.warn('tokenRefresh: production mode — cannot refresh without MSAL');
        emitReauthRequired();
        return null;
      }

      const storedPlayer = localStorage.getItem(PLAYER_KEY);
      if (!storedPlayer) {
        logger.warn('tokenRefresh: no stored player; cannot refresh');
        emitReauthRequired();
        return null;
      }

      let username = '';
      try {
        const player = JSON.parse(storedPlayer) as { username?: string };
        username = player.username ?? '';
      } catch {
        emitReauthRequired();
        return null;
      }
      if (!username) {
        emitReauthRequired();
        return null;
      }

      const response = await fetch(`${API_URL}/dev/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        logger.error('tokenRefresh: refresh failed', { status: response.status });
        emitReauthRequired();
        return null;
      }

      const data = (await response.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, data.token);
      logger.info('tokenRefresh: token refreshed successfully');

      notifyTokenChange(data.token);
      // Re-arm the proactive timer for the new expiry.
      scheduleRefresh(data.token);
      return data.token;
    } catch (err) {
      logger.error('tokenRefresh: refresh threw', { err: String(err) });
      emitReauthRequired();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/**
 * Schedule a proactive refresh based on the token's exp claim. If the
 * token is already past `exp - REFRESH_BEFORE_EXPIRY_MS`, refreshes
 * immediately. Replaces any prior schedule.
 */
export function scheduleRefresh(token: string): void {
  cancelRefresh();

  const expiryMs = getTokenExpiryMs(token);
  const now = Date.now();

  let delayMs: number;
  if (expiryMs !== null) {
    delayMs = expiryMs - now - REFRESH_BEFORE_EXPIRY_MS;
  } else {
    delayMs = DEV_TOKEN_LIFETIME_MS - REFRESH_BEFORE_EXPIRY_MS;
  }

  if (delayMs <= 0) {
    logger.info('tokenRefresh: token near/past expiry, refreshing immediately');
    void refreshToken();
    return;
  }

  delayMs = Math.min(delayMs, MAX_REFRESH_DELAY_MS);
  logger.info(`tokenRefresh: scheduling refresh in ${Math.round(delayMs / 60000)}m`);

  refreshTimer = setTimeout(() => {
    void refreshToken();
  }, delayMs);
}

/** Cancel any pending proactive refresh (e.g. on logout). */
export function cancelRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    logger.debug('tokenRefresh: scheduled refresh cancelled');
  }
}

/**
 * Initialize the refresh scheduler from the current session token. Call
 * once on app start (after the auth provider restores from localStorage).
 */
export function initTokenRefresh(): void {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  scheduleRefresh(token);
}
