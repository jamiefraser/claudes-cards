/**
 * API client — fetch wrapper with Authorization header injection.
 * Uses the token from localStorage (set by DevAuthProvider / MsalAuthProvider; sticky across sessions).
 * SPEC.md §4 — lives at src/api/client.ts.
 *
 * 401 handling: on a 401 we attempt a single token refresh + retry of the
 * original request. If the refresh succeeds, the user's request lands as
 * if nothing happened. If it fails, refreshToken() will have already
 * dispatched 'auth:reauth-required' (see tokenRefresh.ts) and the
 * original ApiError bubbles up so the calling page can show a fallback.
 */
import { logger } from '@/utils/logger';
import { refreshToken } from '@/auth/tokenRefresh';

// Relative URL — nginx proxies /api in production; vite dev proxy forwards in dev.
const API_BASE = (import.meta.env?.VITE_API_URL as string | undefined) ?? '/api/v1';
const TOKEN_KEY = 'auth_token';

export interface ApiError {
  status: number;
  message: string;
  body: unknown;
}

/** Read the current auth token from localStorage (sticky across sessions). */
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Build the Headers + body for a single attempt. Pulled out so the
 * 401-retry path can rebuild with a fresh token without repeating logic.
 */
function buildInit(init: RequestInit): RequestInit {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return { ...init, headers };
}

/**
 * Fetch wrapper that:
 * 1. Prepends the API base URL for relative paths.
 * 2. Injects Authorization: Bearer {token} when a token is present.
 * 3. Defaults Content-Type to application/json.
 * 4. On 401: refreshes the token once and retries the request.
 * 5. Throws an ApiError on any other non-2xx response.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  logger.debug('apiFetch', { url, method: init.method ?? 'GET' });

  let response = await fetch(url, buildInit(init));

  // Reactive token refresh: an expired or invalid token returns 401.
  // Try a single refresh + retry before surfacing the error. Don't try
  // for /dev/token itself or we recurse forever on a misconfigured backend.
  const isAuthEndpoint = url.includes('/dev/token') || url.includes('/auth/');
  if (response.status === 401 && !isAuthEndpoint) {
    logger.info('apiFetch: 401 received, attempting token refresh', { url });
    const fresh = await refreshToken();
    if (fresh) {
      response = await fetch(url, buildInit(init));
      logger.debug('apiFetch: retry after refresh', { url, status: response.status });
    }
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    const err: ApiError = {
      status: response.status,
      message: (body as { error?: string })?.error ?? response.statusText,
      body,
    };
    logger.warn('apiFetch error', { url, status: response.status, message: err.message });
    throw err;
  }

  // 204 No Content — return empty object
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
