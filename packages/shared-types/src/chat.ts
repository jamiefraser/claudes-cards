/**
 * Chat and messaging types.
 * ChatMessage is stored in Redis (chat:history:{roomId}) and used throughout.
 */

/**
 * A single chat message, either table chat or a direct message.
 * System messages (bot/seat notifications) use type='system'.
 */
export interface ChatMessage {
  id: string;
  roomId: string;
  /** playerId of the sender; 'system' for automated system messages. */
  senderId: string;
  senderDisplayName: string;
  content: string;
  type: 'chat' | 'system' | 'dm';
  /** ISO 8601 timestamp */
  sentAt: string;
  /** True if the sender was a spectator when this message was sent. */
  isSpectator?: boolean;
  /** Emoji reactions keyed by emoji string → array of playerIds who reacted. */
  reactions?: Record<string, string[]>;
}
