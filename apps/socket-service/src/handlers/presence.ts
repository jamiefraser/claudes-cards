/**
 * Presence Handler
 *
 * Manages player presence in Redis.
 * Keys per SPEC.md §5:
 *   presence:player:{playerId}  STRING "online"|"in-game"|"away"  TTL: 30s
 *   presence:room:{playerId}    STRING roomId                       TTL: 30s
 */

import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';

const PRESENCE_TTL_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Set presence to "online" with TTL 30s.
 * Broadcasts presence_updated to /lobby.
 */
export async function setPresence(
  socket: Socket,
  status: 'online' | 'in-game' | 'away',
  roomId?: string,
): Promise<void> {
  const { playerId } = socket.data.user;

  try {
    await redis.set(`presence:player:${playerId}`, status, 'EX', PRESENCE_TTL_SECONDS);

    if (roomId) {
      await redis.set(`presence:room:${playerId}`, roomId, 'EX', PRESENCE_TTL_SECONDS);
    }

    logger.debug('Presence updated', { playerId, status, roomId });
  } catch (err) {
    logger.error('Presence update failed', { playerId, err: String(err) });
  }
}

/**
 * Starts a heartbeat interval that refreshes presence every 25s.
 * Returns the interval ID so the caller can clear it on disconnect.
 */
export function startPresenceHeartbeat(
  socket: Socket,
  status: 'online' | 'in-game',
  roomId?: string,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    setPresence(socket, status, roomId).catch((err: Error) => {
      logger.error('Heartbeat presence error', { err: err.message });
    });
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Clear presence keys when a player disconnects.
 */
export async function clearPresence(playerId: string): Promise<void> {
  try {
    await redis.del(`presence:player:${playerId}`);
    await redis.del(`presence:room:${playerId}`);
    logger.debug('Presence cleared', { playerId });
  } catch (err) {
    logger.error('Clear presence failed', { playerId, err: String(err) });
  }
}
