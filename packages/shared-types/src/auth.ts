/**
 * Auth & Identity types
 * Used by: authStore, API middleware, Dev token endpoint
 */

/** The set of roles a player may hold on the platform. */
export type PlayerRole = 'player' | 'moderator' | 'admin';

/**
 * The canonical profile object for an authenticated player.
 * Stored in authStore and returned by the /players/me endpoint.
 */
export interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: PlayerRole;
  createdAt: string; // ISO 8601
}

/**
 * Payload shape for the dev-mode token issued by POST /api/v1/dev/token.
 * Only exists when AUTH_MODE=dev.
 */
export interface DevTokenPayload {
  sub: string;        // playerId
  username: string;
  displayName: string;
  role: PlayerRole;
  iat: number;
  exp: number;
}
