/**
 * API client — fetch wrapper with Authorization header injection.
 * Uses the token from sessionStorage (set by DevAuthProvider / MsalAuthProvider).
 * SPEC.md §4 — lives at src/api/client.ts.
 */
import { logger } from '@/utils/logger';

// Relative URL — nginx proxies /api in production; vite dev proxy forwards in dev.
const API_BASE = (import.meta.env?.VITE_API_URL as string | undefined) ?? '/api/v1';
const TOKEN_KEY = 'auth_token';

export interface ApiError {
  status: number;
  message: string;
  body: unknown;
}

/** Read the current auth token from sessionStorage. */
function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Fetch wrapper that:
 * 1. Prepends the API base URL for relative paths.
 * 2. Injects Authorization: Bearer {token} when a token is present.
 * 3. Defaults Content-Type to application/json.
 * 4. Throws an ApiError on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getToken();

  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  logger.debug('apiFetch', { url, method: init.method ?? 'GET' });

  const response = await fetch(url, { ...init, headers });

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
