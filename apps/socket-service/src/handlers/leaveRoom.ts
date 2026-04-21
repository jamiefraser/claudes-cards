/**
 * leaveRoom Handler
 *
 * Counterpart to joinRoom. Fired by the client when the user navigates
 * away from a table page or explicitly leaves a room.
 *
 * Cleanup rules:
 *   - **Waiting-phase rooms**: remove the player from `room:players:`
 *     SET and broadcast `player_left` so other clients' WaitingRoom
 *     lists drop them. This prevents stale roster entries — the main
 *     cause of the "same player appears twice" complaint after a
 *     re-join/re-navigate cycle.
 *   - **Active-game rooms** (`game:state:{roomId}` exists): do NOT
 *     remove the player. Their seat in the running engine is identified
 *     by playerId, and they may rejoin mid-hand. Just drop the socket
 *     from the room so they stop receiving broadcasts.
 */

import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';

export interface LeaveRoomPayload {
  roomId: string;
}

export async function leaveRoomHandler(
  socket: Socket,
  payload: LeaveRoomPayload,
): Promise<void> {
  const { roomId } = payload ?? ({} as LeaveRoomPayload);
  const { playerId } = socket.data.user;

  if (!roomId) return;

  try {
    // Drop this socket from the Socket.io room so no further broadcasts
    // reach it. Same player may have other sockets (other tabs) still in
    // the room — those are unaffected.
    try { await socket.leave(roomId); } catch { /* ignore */ }

    // Only strip the player from the room roster if the game hasn't
    // started. Mid-game leave is a "disconnect temporarily", not a real
    // departure — startGame already snapshotted the seat list and the
    // engine needs the playerId preserved for rejoin.
    const gameStarted = await redis.exists(`game:state:${roomId}`);
    if (gameStarted) {
      logger.debug('leaveRoom: game in progress, keeping roster entry', {
        roomId,
        playerId,
      });
      return;
    }

    await redis.srem(`room:players:${roomId}`, playerId);
    // Broadcast to peers still in the room so their WaitingRoom views
    // update immediately without waiting for a presence sweep.
    socket.to(roomId).emit('player_left', { playerId });

    logger.info('Player left room', { roomId, playerId });
  } catch (err) {
    logger.error('leaveRoom error', { roomId, playerId, err: String(err) });
  }
}
