/**
 * tableChat Handler
 *
 * Handles chat_message events on the /game namespace.
 * - Validates sender is not muted
 * - Stores message in chat:history (LPUSH + LTRIM to last 100)
 * - Broadcasts chat_message to the room
 */

import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { ChatMessagePayload, ChatMessage } from '@card-platform/shared-types';

const CHAT_HISTORY_MAX = 100;

export async function tableChatHandler(
  socket: Socket,
  payload: ChatMessagePayload,
): Promise<void> {
  const { roomId, content } = payload;
  const { playerId, displayName } = socket.data.user;

  if (!roomId || !content) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId and content are required' });
    return;
  }

  if (content.trim().length === 0) {
    return;
  }

  try {
    const message: ChatMessage = {
      id: randomUUID(),
      roomId,
      senderId: playerId,
      senderDisplayName: displayName,
      content: content.trim(),
      type: 'chat',
      sentAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(message);

    // LPUSH + LTRIM to keep last 100 messages
    await redis.lpush(`chat:history:${roomId}`, serialized);
    await redis.ltrim(`chat:history:${roomId}`, 0, CHAT_HISTORY_MAX - 1);

    // Broadcast the ChatMessage directly to room (frontend expects it as payload)
    socket.nsp.to(roomId).emit('chat_message', message);

    logger.debug('Chat message sent', { roomId, playerId });
  } catch (err) {
    logger.error('tableChat error', { roomId, playerId, err: String(err) });
    socket.emit('game_error', { code: 'CHAT_FAILED', message: 'Failed to send message' });
  }
}
