/**
 * Socket event payload types.
 * All events are listed in SPEC.md §24 (with base events from the original §21/§16).
 * Socket event names use snake_case per SPEC.md §4.2.
 *
 * Namespaces:
 *   /lobby  — room browser, presence, DMs, friend requests, admin events
 *   /game   — in-room game events, chat, bot events
 */
import type { GameState, GameStateDelta, GameAction } from './gameState.js';
import type { Room } from './rooms.js';
import type { ChatMessage } from './chat.js';
import type { LeaderboardEntry } from './leaderboard.js';
import type { FriendRequest } from './friends.js';
import type { OnlineStatus } from './friends.js';
import type { ModerationReport } from './admin.js';
import type { BotActivatedPayload, BotYieldedPayload } from './bot.js';

// ---------------------------------------------------------------------------
// Client → Server payloads
// ---------------------------------------------------------------------------

/** join_room — player joins a game room. Namespace: /game */
export interface JoinRoomPayload {
  roomId: string;
  /** Optional password for private rooms. */
  password?: string;
}

/** rejoin_room — player reconnects after disconnect. Namespace: /game */
export interface RejoinRoomPayload {
  roomId: string;
}

/** game_action — player submits a game action. Namespace: /game */
export interface GameActionPayload {
  roomId: string;
  action: {
    type: string;
    cardIds?: string[];
    payload?: Record<string, unknown>;
  };
}

/** chat_message — player sends a message. Namespace: /game or /lobby */
export interface ChatMessagePayload {
  roomId: string;
  content: string;
}

/** dm_send — player sends a direct message. Namespace: /lobby */
export interface DMSendPayload {
  toPlayerId: string;
  content: string;
}

/** spectator_join — observer requests spectator access. Namespace: /game */
export interface SpectatorJoinPayload {
  roomId: string;
}

/**
 * request_resync — client detected a delta version gap and needs a full
 * state snapshot. Namespace: /game. Server replies with `game_state_sync`.
 * See SPEC.md §22.
 */
export interface RequestResyncPayload {
  roomId: string;
  /** The version the client currently has applied (for server-side logging). */
  currentVersion: number;
}

/** report_message — player reports a chat message. Namespace: /lobby */
export interface ReportMessagePayload {
  messageId: string;
  reportedPlayerId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Server → Client payloads
// ---------------------------------------------------------------------------

/** game_state_sync — full state sent on join or rejoin. Namespace: /game */
export interface GameStateSyncPayload {
  /** Null if the game hasn't been started yet (lobby / waiting room state). */
  state: GameState | null;
}

/** game_state_delta — partial state update after each action. Namespace: /game */
export interface GameStateDeltaPayload {
  delta: GameStateDelta;
}

/** room_list — list of rooms sent to /lobby clients. Namespace: /lobby */
export interface RoomListPayload {
  rooms: Room[];
  total: number;
}

/** room_updated — a room was updated (player joined, settings changed). Namespace: /lobby */
export interface RoomUpdatedPayload {
  room: Room;
}

/** room_removed — a room was removed (game ended or host closed). Namespace: /lobby */
export interface RoomRemovedPayload {
  roomId: string;
}

/** presence_updated — a player's online status changed. Namespace: /lobby */
export interface PresenceUpdatedPayload {
  playerId: string;
  status: OnlineStatus;
  roomId?: string;
}

/** leaderboard_updated — leaderboard data changed. Namespace: /lobby */
export interface LeaderboardUpdatedPayload {
  gameId: string;
  entries: LeaderboardEntry[];
}

/** friend_request — a new friend request was received. Namespace: /lobby */
export interface FriendRequestPayload {
  request: FriendRequest;
}

/** friend_status — a friend's status changed. Namespace: /lobby */
export interface FriendStatusPayload {
  playerId: string;
  status: OnlineStatus;
  roomId?: string;
}

/** dm_message — a direct message was received. Namespace: /lobby */
export interface DMMessagePayload {
  message: ChatMessage;
}

/** spectator_joined — a spectator joined the room. Namespace: /game */
export interface SpectatorJoinedPayload {
  playerId: string;
  displayName: string;
}

/** game_error — an error occurred (invalid action, etc.). Namespace: /game */
export interface GameErrorPayload {
  code: string;
  message: string;
}

/**
 * moderation_muted — sent to the muted player only. Namespace: /lobby
 * SPEC.md §24.2
 */
export interface ModerationMutedPayload {
  /** ISO 8601 expiry time, or null for permanent mute. */
  expiresAt: string | null;
}

/**
 * admin_report_received — sent to all connected moderators/admins. Namespace: /lobby
 * SPEC.md §24.2
 */
export interface AdminReportReceivedPayload {
  report: ModerationReport;
}

/**
 * bot_activated — bot has taken a seat. Namespace: /game
 * Re-exported from bot.ts for convenience; use BotActivatedPayload directly.
 * SPEC.md §24.1
 */
export type BotActivatedSocketPayload = BotActivatedPayload;

/**
 * bot_yielded — human has reclaimed their seat. Namespace: /game
 * SPEC.md §24.1
 */
export type BotYieldedSocketPayload = BotYieldedPayload;

/**
 * game_replay — full action log for a room. Namespace: /game (admin/dev only)
 * SPEC.md §25.2
 */
export interface GameReplayPayload {
  roomId: string;
  actions: GameAction[];
}
