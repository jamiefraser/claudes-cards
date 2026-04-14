/**
 * Auth API calls — SPEC.md §25
 * /auth/me, POST /dev/token
 */
import { apiFetch } from './client';
import type { PlayerProfile } from '@shared/auth';

export interface DevTokenResponse {
  token: string;
  playerId: string;
  username: string;
  role: string;
}

/** GET /api/v1/auth/me — returns current player's profile. */
export async function getMe(): Promise<PlayerProfile> {
  return apiFetch<PlayerProfile>('/auth/me');
}

/**
 * POST /api/v1/dev/token — obtain a dev JWT for a test user.
 * Only available when AUTH_MODE=dev.
 */
export async function postDevToken(username: string): Promise<DevTokenResponse> {
  return apiFetch<DevTokenResponse>('/dev/token', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}
