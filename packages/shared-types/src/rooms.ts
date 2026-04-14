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
