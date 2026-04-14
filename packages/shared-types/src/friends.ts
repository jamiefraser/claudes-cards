/**
 * Friends & Social Graph types.
 * Used in lobbyStore, friends API, and socket events.
 */

/** Presence status for a player. Matches the values stored in Redis presence:player:{id}. */
export type OnlineStatus = 'online' | 'in-game' | 'away' | 'offline';

/** A resolved friendship entry (both players have accepted). */
export interface FriendEntry {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  status: OnlineStatus;
  /** roomId if status === 'in-game', otherwise null. */
  currentRoomId: string | null;
}

/** A pending friend request (not yet accepted). */
export interface FriendRequest {
  id: string;
  fromPlayerId: string;
  fromDisplayName: string;
  fromAvatarUrl: string | null;
  toPlayerId: string;
  /** ISO 8601 */
  sentAt: string;
}

/** A DM inbox entry summarising the latest unread message from one player. */
export interface DMInboxEntry {
  fromPlayerId: string;
  fromDisplayName: string;
  fromAvatarUrl: string | null;
  unreadCount: number;
  lastMessage: string;
  /** ISO 8601 */
  lastMessageAt: string;
}
