/**
 * Token Interceptor
 *
 * Utility functions that add the Authorization: Bearer {token} header
 * to outgoing fetch / axios requests.
 *
 * Usage with fetch:
 *   const res = await authedFetch('/api/v1/players/me');
 *
 * Usage with axios:
 *   axios.interceptors.request.use(axiosAuthInterceptor);
 */

const TOKEN_KEY = 'auth_token';

/** Read the current token from sessionStorage. Returns null if not authenticated. */
export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Wrapper around fetch that automatically attaches the Authorization header.
 * Falls back to a plain fetch call if no token is found (lets the server return 401).
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = getStoredToken();

  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

/**
 * Axios request interceptor — call this with axios.interceptors.request.use().
 *
 * Example:
 *   import axios from 'axios';
 *   import { axiosAuthInterceptor } from '@/auth/tokenInterceptor';
 *   axios.interceptors.request.use(axiosAuthInterceptor);
 */
export function axiosAuthInterceptor(config: {
  headers?: Record<string, string>;
  [key: string]: unknown;
}): typeof config {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}
