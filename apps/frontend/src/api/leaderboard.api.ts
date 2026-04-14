/**
 * Leaderboard API — SPEC.md §25 (Epic 7)
 */
import { apiFetch } from './client';
import type { LeaderboardEntry, LeaderboardQuery } from '@shared/leaderboard';

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
}

/** GET /api/v1/leaderboard/:gameId — fetch leaderboard for a game. */
export async function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  params.set('period', query.period);
  if (query.friendsOnly !== undefined) params.set('friendsOnly', String(query.friendsOnly));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  return apiFetch<LeaderboardResponse>(`/leaderboard/${query.gameId}?${params.toString()}`);
}
