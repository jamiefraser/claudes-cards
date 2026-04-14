/**
 * /game Namespace
 *
 * Handles all in-room gameplay events per SPEC.md §24.1.
 * Events: join_room, rejoin_room, game_action, chat_message, spectator_join, disconnect
 */

import type { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from '../middleware/socketAuth';
import { joinRoomHandler } from '../handlers/joinRoom';
import { rejoinRoomHandler } from '../handlers/rejoinRoom';
import { gameActionHandler } from '../handlers/gameAction';
import { tableChatHandler } from '../handlers/tableChat';
import { startGameHandler } from '../handlers/startGame';
import { setPresence, startPresenceHeartbeat, clearPresence } from '../handlers/presence';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type {
  JoinRoomPayload,
  RejoinRoomPayload,
  GameActionPayload,
  ChatMessagePayload,
  SpectatorJoinPayload,
} from '@card-platform/shared-types';
import type { GameRegistry } from '../games/registry';
import type { BotController } from '../bots/BotController';
import type { BotPlayer } from '../bots/BotPlayer';

export function setupGameNamespace(
  io: Server,
  registry: GameRegistry,
  botController: BotController,
  botPlayer: BotPlayer,
): void {
  const gameNsp = io.of('/game');

  // Register auth middleware
  gameNsp.use(socketAuthMiddleware);

  gameNsp.on('connection', (socket: Socket) => {
    const { playerId } = socket.data.user;
    logger.info('Player connected to /game', { playerId, socketId: socket.id });

    // Set initial presence
    setPresence(socket, 'online').catch((err: Error) => {
      logger.error('Failed to set initial presence', { err: err.message });
    });

    // Start heartbeat
    const heartbeat = startPresenceHeartbeat(socket, 'online');

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------

    socket.on('join_room', (payload: JoinRoomPayload) => {
      joinRoomHandler(socket, payload).catch((err: Error) => {
        logger.error('join_room error', { err: err.message, playerId });
      });
    });

    socket.on('rejoin_room', (payload: RejoinRoomPayload) => {
      rejoinRoomHandler(socket, payload, botController).catch((err: Error) => {
        logger.error('rejoin_room error', { err: err.message, playerId });
      });
    });

    socket.on('game_action', (payload: GameActionPayload) => {
      gameActionHandler(socket, payload, registry, botController).catch((err: Error) => {
        logger.error('game_action error', { err: err.message, playerId });
      });
    });

    socket.on('chat_message', (payload: ChatMessagePayload) => {
      tableChatHandler(socket, payload).catch((err: Error) => {
        logger.error('chat_message error', { err: err.message, playerId });
      });
    });

    socket.on('spectator_join', (payload: SpectatorJoinPayload) => {
      handleSpectatorJoin(socket, payload).catch((err: Error) => {
        logger.error('spectator_join error', { err: err.message, playerId });
      });
    });

    socket.on('start_game', (payload: { roomId: string; botCount?: number }) => {
      startGameHandler(socket, payload, registry, botController).catch((err: Error) => {
        logger.error('start_game error', { err: err.message, playerId });
      });
    });

    // -----------------------------------------------------------------------
    // Disconnect
    // -----------------------------------------------------------------------

    socket.on('disconnect', () => {
      clearInterval(heartbeat);
      clearPresence(playerId).catch((err: Error) => {
        logger.error('clearPresence error on disconnect', { err: err.message });
      });
      logger.info('Player disconnected from /game', { playerId, socketId: socket.id });
    });
  });
}

/**
 * Handle spectator_join — adds player to room:spectators SET.
 */
async function handleSpectatorJoin(socket: Socket, payload: SpectatorJoinPayload): Promise<void> {
  const { roomId } = payload;
  const { playerId, displayName } = socket.data.user;

  if (!roomId) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId is required' });
    return;
  }

  await redis.sadd(`room:spectators:${roomId}`, playerId);
  await socket.join(roomId);

  socket.to(roomId).emit('spectator_joined', { playerId, displayName });
  logger.info('Spectator joined room', { roomId, playerId });
}
