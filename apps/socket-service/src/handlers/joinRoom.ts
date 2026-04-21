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
import { redactStateForRecipient } from '../utils/gameStateRedaction';

export async function joinRoomHandler(socket: Socket, payload: JoinRoomPayload): Promise<void> {
  const { roomId, password: _password } = payload;
  const { playerId, displayName } = socket.data.user;

  if (!roomId) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId is required' });
    return;
  }

  try {
    // SADD is idempotent — a reconnect or duplicate join_room (e.g. from
    // a stale client retry) leaves the set unchanged. That's our primary
    // dedup guarantee.
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
    const rawState = stateJson ? JSON.parse(stateJson) : null;
    // Redact other players' hands before this client ever sees them.
    const syncPayload: GameStateSyncPayload = {
      state: rawState ? redactStateForRecipient(rawState, playerId) : null,
    };

    // Send full state to the joining player
    socket.emit('game_state_sync', syncPayload);

    // Send the AUTHORITATIVE roster to the joining player so the waiting-
    // room view doesn't have to reconstruct it from player_joined deltas
    // (it can't — it only sees events that arrive after it subscribed).
    // This is the single source of truth; the deltas below are for
    // already-subscribed peers.
    const roster = await buildRoster(roomId);
    socket.emit('room_roster', { players: roster });

    // Broadcast player_joined to peers already in the room. Do NOT emit
    // it to the joining socket too — that used to race with the waiting-
    // room's seed effect and produced a double-add. The joining socket
    // gets its authoritative list via `room_roster` above.
    socket.to(roomId).emit('player_joined', { playerId, displayName });

    logger.info('Player joined room', { roomId, playerId });
  } catch (err) {
    logger.error('joinRoom error', { roomId, playerId, err: String(err) });
    socket.emit('game_error', { code: 'JOIN_FAILED', message: 'Failed to join room' });
  }
}

/**
 * Build the current player roster for a room by intersecting the
 * authoritative `room:players:{roomId}` SET with cached display names.
 * Returned list is deduped by construction (the SET is). Used by both
 * joinRoom and leaveRoom to send `room_roster` to interested clients.
 */
export async function buildRoster(
  roomId: string,
): Promise<Array<{ playerId: string; displayName: string }>> {
  const playerIds = await redis.smembers(`room:players:${roomId}`);
  if (playerIds.length === 0) return [];
  const nameKeys = playerIds.map((id) => `player:displayName:${id}`);
  const names = await redis.mget(...nameKeys);
  return playerIds.map((id, i) => ({
    playerId: id,
    displayName: names[i] ?? id,
  }));
}
