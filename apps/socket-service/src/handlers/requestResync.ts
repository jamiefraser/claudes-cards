/**
 * request_resync Handler
 *
 * When a client receives a game_state_delta whose prevVersion doesn't
 * line up with its currently-applied version, it has missed at least
 * one delta (dropped websocket frame, race with reconnection, etc.).
 * Rather than try to patch a diverging state from an incomplete delta
 * history, the client asks the server for a fresh snapshot. SPEC.md §22.
 */

import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type {
  RequestResyncPayload,
  GameStateSyncPayload,
} from '@card-platform/shared-types';
import { redactStateForRecipient } from '../utils/gameStateRedaction';

export async function requestResyncHandler(
  socket: Socket,
  payload: RequestResyncPayload,
): Promise<void> {
  const { roomId, currentVersion } = payload ?? ({} as RequestResyncPayload);
  const { playerId } = socket.data.user;

  if (!roomId) {
    socket.emit('game_error', {
      code: 'INVALID_PAYLOAD',
      message: 'roomId is required',
    });
    return;
  }

  try {
    const stateJson = await redis.get(`game:state:${roomId}`);
    const rawState = stateJson ? JSON.parse(stateJson) : null;
    const syncPayload: GameStateSyncPayload = {
      state: rawState ? redactStateForRecipient(rawState, playerId) : null,
    };
    socket.emit('game_state_sync', syncPayload);
    logger.info('request_resync: sent snapshot', {
      roomId,
      playerId,
      clientVersion: currentVersion,
      serverVersion: rawState?.version,
    });
  } catch (err) {
    logger.error('request_resync error', {
      roomId,
      playerId,
      err: String(err),
    });
    socket.emit('game_error', {
      code: 'RESYNC_FAILED',
      message: 'Failed to resync state',
    });
  }
}
