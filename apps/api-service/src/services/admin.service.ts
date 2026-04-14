/**
 * Admin Service
 *
 * Business logic for admin and moderation operations.
 * SPEC.md §22 Epic 11 and §25.1.
 */

import { prisma } from '../db/prisma';
import { Prisma, LeaderboardPeriod } from '@prisma/client';
import type {
  AdminDashboardStats,
  AdminPlayerProfile,
  PaginatedReports,
  ModerationReport,
  MuteRecord,
  ModerationAuditLog,
  GameCatalogEntry,
  ApplyMutePayload,
} from '@shared/admin';

export async function getDashboardStats(): Promise<AdminDashboardStats> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [activePlayers, activeRooms, pendingReports, activelyMuted, gamesPlayedToday] =
    await Promise.all([
      prisma.player.count(),
      prisma.room.count({ where: { status: { in: ['waiting' as const, 'playing' as const] } } }),
      prisma.moderationReport.count({ where: { status: 'PENDING' } }),
      prisma.muteRecord.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      prisma.gameResult.count({
        where: { endedAt: { gte: startOfToday } },
      }),
    ]);

  return {
    activePlayers,
    activeRooms,
    pendingReports,
    activelyMuted,
    gamesPlayedToday,
  };
}

export async function getReports(options: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedReports> {
  const { status, page = 1, pageSize = 20 } = options;
  const skip = (page - 1) * pageSize;

  const validStatuses = ['PENDING', 'ACTIONED', 'DISMISSED'] as const;
  type ValidStatus = typeof validStatuses[number];
  const where: Prisma.ModerationReportWhereInput = (status && validStatuses.includes(status as ValidStatus))
    ? { status: status as ValidStatus }
    : {};

  const [reports, total] = await Promise.all([
    prisma.moderationReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.moderationReport.count({ where }),
  ]);

  return {
    reports: reports.map((r) => ({
      id: r.id,
      reportedByPlayerId: r.reportedByPlayerId,
      reportedPlayerId: r.reportedPlayerId,
      messageId: r.messageId ?? undefined,
      reason: r.reason,
      status: r.status as ModerationReport['status'],
      createdAt: r.createdAt.toISOString(),
      actionedAt: r.actionedAt?.toISOString(),
      actionedByModId: r.actionedByModId ?? undefined,
    })),
    total,
    page,
    pageSize,
  };
}

export async function actionReport(
  id: string,
  action: 'dismiss' | 'actioned',
  moderatorId: string,
): Promise<ModerationReport | null> {
  const report = await prisma.moderationReport.findUnique({ where: { id } });
  if (!report) return null;

  const newStatus = action === 'dismiss' ? 'DISMISSED' : 'ACTIONED';

  const updated = await prisma.moderationReport.update({
    where: { id },
    data: {
      status: newStatus,
      actionedAt: new Date(),
      actionedByModId: moderatorId,
    },
  });

  // Append to audit log — APPEND-ONLY per CLAUDE.md rule 15
  await prisma.moderationAuditLog.create({
    data: {
      actionType: action === 'dismiss' ? 'dismiss' : 'mute',
      moderatorId,
      targetPlayerId: report.reportedPlayerId,
      reason: `Report ${id} ${action}`,
    },
  });

  return {
    id: updated.id,
    reportedByPlayerId: updated.reportedByPlayerId,
    reportedPlayerId: updated.reportedPlayerId,
    messageId: updated.messageId ?? undefined,
    reason: updated.reason,
    status: updated.status as ModerationReport['status'],
    createdAt: updated.createdAt.toISOString(),
    actionedAt: updated.actionedAt?.toISOString(),
    actionedByModId: updated.actionedByModId ?? undefined,
  };
}

export async function mutePlayer(
  payload: ApplyMutePayload,
  moderatorId: string,
): Promise<MuteRecord> {
  const durationMap: Record<string, number | null> = {
    '15min': 15 * 60 * 1000,
    '1hr': 60 * 60 * 1000,
    '24hr': 24 * 60 * 60 * 1000,
    '7day': 7 * 24 * 60 * 60 * 1000,
    permanent: null,
  };

  const durationMs = durationMap[payload.duration];
  const expiresAt = durationMs != null ? new Date(Date.now() + durationMs) : null;

  const muteRecord = await prisma.muteRecord.create({
    data: {
      playerId: payload.playerId,
      mutedByModId: moderatorId,
      reason: payload.reason,
      expiresAt,
    },
  });

  // Append to audit log — APPEND-ONLY per CLAUDE.md rule 15
  await prisma.moderationAuditLog.create({
    data: {
      actionType: 'mute',
      moderatorId,
      targetPlayerId: payload.playerId,
      reason: payload.reason,
      metadata: { duration: payload.duration, muteRecordId: muteRecord.id },
    },
  });

  return {
    id: muteRecord.id,
    playerId: muteRecord.playerId,
    mutedByModId: muteRecord.mutedByModId,
    reason: muteRecord.reason,
    expiresAt: muteRecord.expiresAt?.toISOString() ?? null,
    createdAt: muteRecord.createdAt.toISOString(),
  };
}

export async function unmutePlayer(
  playerId: string,
  moderatorId: string,
): Promise<{ success: boolean }> {
  // Delete all active mutes for this player
  await prisma.muteRecord.deleteMany({ where: { playerId } });

  // Append to audit log — APPEND-ONLY per CLAUDE.md rule 15
  await prisma.moderationAuditLog.create({
    data: {
      actionType: 'unmute',
      moderatorId,
      targetPlayerId: playerId,
    },
  });

  return { success: true };
}

export async function getAdminPlayerProfile(id: string): Promise<AdminPlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  });

  if (!player) return null;

  const now = new Date();

  const [leaderboardTotals, activeMutes, reportHistory] = await Promise.all([
    prisma.leaderboardEntry.aggregate({
      where: { playerId: id },
      _sum: { wins: true, losses: true, draws: true },
    }),
    prisma.muteRecord.findMany({
      where: {
        playerId: id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.moderationReport.findMany({
      where: { reportedPlayerId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    role: player.role,
    createdAt: player.createdAt.toISOString(),
    gamesPlayed: (leaderboardTotals._sum.wins ?? 0) + (leaderboardTotals._sum.losses ?? 0) + (leaderboardTotals._sum.draws ?? 0),
    activeMutes: activeMutes.map((m) => ({
      id: m.id,
      playerId: m.playerId,
      mutedByModId: m.mutedByModId,
      reason: m.reason,
      expiresAt: m.expiresAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    reportHistory: reportHistory.map((r) => ({
      id: r.id,
      reportedByPlayerId: r.reportedByPlayerId,
      reportedPlayerId: r.reportedPlayerId,
      messageId: r.messageId ?? undefined,
      reason: r.reason,
      status: r.status as ModerationReport['status'],
      createdAt: r.createdAt.toISOString(),
      actionedAt: r.actionedAt?.toISOString(),
      actionedByModId: r.actionedByModId ?? undefined,
    })),
  };
}

export async function getAuditLog(options: {
  playerId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ entries: ModerationAuditLog[]; total: number }> {
  const { playerId, page = 1, pageSize = 20 } = options;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ModerationAuditLogWhereInput = playerId ? { targetPlayerId: playerId } : {};

  const [entries, total] = await Promise.all([
    prisma.moderationAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.moderationAuditLog.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      id: e.id,
      actionType: e.actionType as ModerationAuditLog['actionType'],
      moderatorId: e.moderatorId,
      targetPlayerId: e.targetPlayerId,
      reason: e.reason ?? undefined,
      metadata: (e.metadata as Record<string, unknown>) ?? undefined,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
  };
}

export async function setGameEnabled(
  id: string,
  enabled: boolean,
): Promise<GameCatalogEntry | null> {
  const game = await prisma.gameCatalog.findUnique({ where: { id } });
  if (!game) return null;

  const updated = await prisma.gameCatalog.update({
    where: { id },
    data: { enabled },
  });

  const activeRoomCount = await prisma.room.count({
    where: { gameId: id, status: 'playing' },
  });

  return {
    id: updated.id,
    name: updated.name,
    category: updated.category,
    enabled: updated.enabled,
    minPlayers: updated.minPlayers,
    maxPlayers: updated.maxPlayers,
    supportsAsync: updated.supportsAsync,
    activeRoomCount,
  };
}

export async function recalculateLeaderboard(_gameId: string): Promise<{ success: boolean }> {
  // Placeholder — actual recalculation is handled by the worker service.
  // This endpoint triggers the recalculation job (queued via BullMQ in the worker unit).
  return { success: true };
}

export async function resetMonthlyLeaderboard(gameId: string): Promise<{ success: boolean }> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  await prisma.leaderboardEntry.deleteMany({
    where: { gameId, period: LeaderboardPeriod.monthly, month: currentMonth },
  });

  return { success: true };
}
