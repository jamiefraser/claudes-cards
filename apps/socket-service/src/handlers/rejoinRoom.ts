/**
 * rejoinRoom Handler
 *
 * Handles the rejoin_room event on the /game namespace.
 * - Verifies player is a member of the room
 * - Yields any active bot for this player (before state sync)
 * - Sends full game_state_sync + chat history
 * - Broadcasts player_rejoined
 */

import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { RejoinRoomPayload, GameStateSyncPayload } from '@card-platform/shared-types';
import type { BotController } from '../bots/BotController';

export async function rejoinRoomHandler(
  socket: Socket,
  payload: RejoinRoomPayload,
  botController: BotController,
): Promise<void> {
  const { roomId } = payload;
  const { playerId, displayName } = socket.data.user;

  if (!roomId) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId is required' });
    return;
  }

  try {
    // Verify membership
    const isMember = await redis.sismember(`room:players:${roomId}`, playerId);
    if (!isMember) {
      socket.emit('game_error', { code: 'NOT_MEMBER', message: 'You are not a member of this room' });
      return;
    }

    // Yield bot before state sync (per architecture doc)
    if (botController.isBotActive(roomId, playerId)) {
      await botController.yieldBot(roomId, playerId);
    }

    // Socket joins the room
    await socket.join(roomId);

    // Fetch current game state
    const stateJson = await redis.get(`game:state:${roomId}`);
    const syncPayload: GameStateSyncPayload = {
      state: stateJson ? JSON.parse(stateJson) : null,
    };
    socket.emit('game_state_sync', syncPayload);

    // Fetch chat history (last 100 messages, most recent first due to LPUSH)
    const chatHistory = await redis.lrange(`chat:history:${roomId}`, 0, 99);
    if (chatHistory.length > 0) {
      const messages = chatHistory.map((m) => JSON.parse(m)).reverse();
      socket.emit('chat_history', { messages });
    }

    // Broadcast rejoin to room
    socket.to(roomId).emit('player_rejoined', { playerId, displayName });

    logger.info('Player rejoined room', { roomId, playerId });
  } catch (err) {
    logger.error('rejoinRoom error', { roomId, playerId, err: String(err) });
    socket.emit('game_error', { code: 'REJOIN_FAILED', message: 'Failed to rejoin room' });
  }
}
