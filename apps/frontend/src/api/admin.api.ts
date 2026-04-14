/**
 * Admin API — SPEC.md §25.1
 * Requires moderator or admin role.
 */
import { apiFetch } from './client';
import type {
  AdminDashboardStats,
  PaginatedReports,
  ModerationReport,
  MuteRecord,
  ApplyMutePayload,
  AdminPlayerProfile,
  ModerationAuditLog,
  GameCatalogEntry,
} from '@shared/admin';

/** GET /api/v1/admin/dashboard */
export async function getAdminDashboard(): Promise<AdminDashboardStats> {
  return apiFetch<AdminDashboardStats>('/admin/dashboard');
}

/** GET /api/v1/admin/reports */
export async function getReports(
  status: 'pending' | 'actioned' | 'dismissed' = 'pending',
  page = 1,
): Promise<PaginatedReports> {
  return apiFetch<PaginatedReports>(`/admin/reports?status=${status}&page=${page}`);
}

/** PATCH /api/v1/admin/reports/:id */
export async function updateReport(
  id: string,
  action: 'dismiss' | 'actioned',
): Promise<ModerationReport> {
  return apiFetch<ModerationReport>(`/admin/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

/** POST /api/v1/admin/mute */
export async function applyMute(payload: ApplyMutePayload): Promise<MuteRecord> {
  return apiFetch<MuteRecord>('/admin/mute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/v1/admin/mute/:playerId */
export async function removeMute(playerId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/admin/mute/${playerId}`, {
    method: 'DELETE',
  });
}

/** GET /api/v1/admin/users/:id */
export async function getAdminUser(id: string): Promise<AdminPlayerProfile> {
  return apiFetch<AdminPlayerProfile>(`/admin/users/${id}`);
}

/** GET /api/v1/admin/audit */
export async function getAuditLog(
  playerId?: string,
  page = 1,
): Promise<ModerationAuditLog[]> {
  const params = new URLSearchParams();
  if (playerId) params.set('playerId', playerId);
  params.set('page', String(page));
  return apiFetch<ModerationAuditLog[]>(`/admin/audit?${params.toString()}`);
}

/** PATCH /api/v1/admin/games/:id — admin only */
export async function updateGame(
  id: string,
  enabled: boolean,
): Promise<GameCatalogEntry> {
  return apiFetch<GameCatalogEntry>(`/admin/games/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/** POST /api/v1/admin/leaderboards/:gameId/recalculate — admin only */
export async function recalculateLeaderboard(
  gameId: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/admin/leaderboards/${gameId}/recalculate`,
    { method: 'POST' },
  );
}

/** DELETE /api/v1/admin/leaderboards/:gameId/monthly — admin only */
export async function resetMonthlyLeaderboard(
  gameId: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/admin/leaderboards/${gameId}/monthly`,
    { method: 'DELETE' },
  );
}
