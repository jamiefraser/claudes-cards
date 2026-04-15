/**
 * joinRoom Handler
 *
 * Handles the join_room event on the /game namespace.
 * - Adds player to room:players:{roomId} SET
 * - socket.join(roomId)
 * - Sends game_state_sync (full state or null if no game started)
 * - Broadcasts player_joined to the room
 */

import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { JoinRoomPayload, GameStateSyncPayload } from '@card-platform/shared-types';

export async function joinRoomHandler(socket: Socket, payload: JoinRoomPayload): Promise<void> {
  const { roomId, password: _password } = payload;
  const { playerId, displayName } = socket.data.user;

  if (!roomId) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId is required' });
    return;
  }

  try {
    // Add player to room:players SET
    await redis.sadd(`room:players:${roomId}`, playerId);

    // Cache displayName so startGame can swap in real names instead of the
    // raw playerId UUIDs the engines use as a fallback. Week-long TTL covers
    // the whole async play window; refreshed on every join/rejoin.
    if (displayName) {
      await redis.set(
        `player:displayName:${playerId}`,
        displayName,
        'EX',
        7 * 24 * 3600,
      );
    }

    // Socket joins the Socket.io room
    await socket.join(roomId);

    // Fetch current game state
    const stateJson = await redis.get(`game:state:${roomId}`);
    const syncPayload: GameStateSyncPayload = {
      state: stateJson ? JSON.parse(stateJson) : null,
    };

    // Send full state to the joining player
    socket.emit('game_state_sync', syncPayload);

    // Broadcast player_joined to everyone else in the room
    socket.to(roomId).emit('player_joined', { playerId, displayName });

    // Also emit to self so tests can confirm the join
    socket.emit('player_joined', { playerId, displayName });

    logger.info('Player joined room', { roomId, playerId });
  } catch (err) {
    logger.error('joinRoom error', { roomId, playerId, err: String(err) });
    socket.emit('game_error', { code: 'JOIN_FAILED', message: 'Failed to join room' });
  }
}
