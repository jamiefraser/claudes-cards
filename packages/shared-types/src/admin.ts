/**
 * Admin and moderation types.
 * SPEC.md §11.3 and §22.
 */

/** Status of a moderation report. Matches the Prisma ReportStatus enum. */
export type ReportStatus = 'PENDING' | 'ACTIONED' | 'DISMISSED';

/** Duration options for muting a player. */
export type MuteDuration = '15min' | '1hr' | '24hr' | '7day' | 'permanent';

/**
 * A moderation report filed by a player against another player.
 * SPEC.md §11.3.
 */
export interface ModerationReport {
  id: string;
  reportedByPlayerId: string;
  reportedPlayerId: string;
  /** If the report is about a specific message. */
  messageId?: string;
  reason: string;
  status: ReportStatus;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601, set when actioned or dismissed. */
  actionedAt?: string;
  actionedByModId?: string;
}

/**
 * A mute record for a player.
 * SPEC.md §11.3.
 */
export interface MuteRecord {
  id: string;
  playerId: string;
  mutedByModId: string;
  reason: string;
  /** ISO 8601 expiry, or null for a permanent mute. */
  expiresAt: string | null;
  /** ISO 8601 */
  createdAt: string;
}

/**
 * Payload for POST /api/v1/admin/mute.
 */
export interface ApplyMutePayload {
  playerId: string;
  duration: MuteDuration;
  reason: string;
}

/**
 * Statistics displayed on the admin dashboard.
 * Returned by GET /api/v1/admin/dashboard.
 */
export interface AdminDashboardStats {
  activePlayers: number;
  activeRooms: number;
  pendingReports: number;
  activelyMuted: number;
  gamesPlayedToday: number;
}

/**
 * A game registered in the platform catalog.
 * Returned by GET /api/v1/games and PATCH /api/v1/admin/games/:id.
 */
export interface GameCatalogEntry {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  minPlayers: number;
  maxPlayers: number;
  supportsAsync: boolean;
  /** Number of rooms currently in progress for this game. */
  activeRoomCount: number;
}

/**
 * Extended player profile for admin use.
 * Returned by GET /api/v1/admin/users/:id.
 */
export interface AdminPlayerProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  /** ISO 8601 */
  createdAt: string;
  gamesPlayed: number;
  activeMutes: MuteRecord[];
  reportHistory: ModerationReport[];
}

/**
 * Paginated response for moderation reports.
 * Returned by GET /api/v1/admin/reports.
 */
export interface PaginatedReports {
  reports: ModerationReport[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * An entry in the moderation audit log (append-only).
 * SPEC.md §22 Story 11.6.
 */
export interface ModerationAuditLog {
  id: string;
  /** Action type: 'mute' | 'unmute' | 'dismiss' | 'warn' */
  actionType: 'mute' | 'unmute' | 'dismiss' | 'warn';
  moderatorId: string;
  targetPlayerId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  /** ISO 8601 */
  createdAt: string;
}
