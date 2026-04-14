/**
 * Leaderboard types.
 * Used by the leaderboard worker, API, and LeaderboardTable component.
 */

/** A single leaderboard row. */
export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  gameId: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  rank: number;
  /** 'monthly' or 'all-time' */
  period: 'monthly' | 'all-time';
  /** ISO 8601 timestamp of the last update. */
  updatedAt: string;
}

/** Query parameters for the leaderboard API endpoint. */
export interface LeaderboardQuery {
  gameId: string;
  period: 'monthly' | 'all-time';
  /** If provided, returns rankings for only this player's friends. */
  friendsOnly?: boolean;
  limit?: number;
  offset?: number;
}
