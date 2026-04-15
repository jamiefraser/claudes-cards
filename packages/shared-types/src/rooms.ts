/**
 * Room and lobby types.
 * Used in lobbyStore, rooms API, socket events, and CreateRoomModal.
 */
import type { PlayerProfile } from './auth.js';

/** Per-room settings chosen at room creation. */
export interface RoomSettings {
  maxPlayers: number;
  asyncMode: boolean;
  /** Turn timer in seconds. Null for real-time games. Options: 86400 (24h), 172800 (48h), 259200 (72h). */
  turnTimerSeconds: number | null;
  isPrivate: boolean;
  /** Optional password for private rooms. */
  password: string | null;
  /**
   * Per-game house-rule overrides, keyed by engine gameId. Individual engines
   * interpret their own sub-keys; unknown keys are ignored.
   *
   * Crazy Eights (`crazyeights`):
   *   - multiSameRank: play multiple cards of the same rank in one turn
   *   - playAfter8:    after playing an 8 and declaring a suit, keep the turn
   *                    to play one additional card of the declared suit
   *   - suitChain:     play a chain where each successive card shares rank
   *                    or suit with the previous one in the chain
   */
  houseRules?: Record<string, Record<string, boolean>>;
}

/** Crazy Eights house-rule toggle keys. */
export interface CrazyEightsHouseRules {
  multiSameRank?: boolean;
  playAfter8?: boolean;
  suitChain?: boolean;
}

/** A room in the lobby. */
export interface Room {
  id: string;
  gameId: string;
  /** Display name for the room, set by the host. */
  name?: string;
  hostId: string;
  /** Abbreviated player profiles for players currently in the room. */
  players: Pick<PlayerProfile, 'id' | 'displayName' | 'avatarUrl'>[];
  settings: RoomSettings;
  status: 'waiting' | 'in-progress' | 'ended';
  /** ISO 8601 */
  createdAt: string;
}

/** Query parameters for listing rooms in the Game Browser. */
export interface RoomListQuery {
  gameId?: string;
  status?: 'waiting' | 'in-progress';
  asyncMode?: boolean;
  hasSpace?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Payload for creating a new room (POST /api/v1/rooms). */
export interface CreateRoomPayload {
  gameId: string;
  name?: string;
  settings: RoomSettings;
}
