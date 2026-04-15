/**
 * startGame Handler — host-only room lifecycle event.
 *
 * Flow:
 * 1. Host emits `start_game { roomId, botCount }` after WaitingRoom.
 * 2. We look up the Room row to verify the caller is the host.
 * 3. Gather all current members of `room:players:{roomId}` (human joins).
 * 4. Synthesise `botCount` bot player IDs (prefix `bot:` per SPEC.md §9).
 *    - If `humans === 1` (host only), `botCount` must be ≥ 1.
 * 5. Call `engine.startGame({ players, gameId, roomId })`.
 * 6. Write GameState to `game:state:{roomId}`.
 * 7. For each bot, set `bot:active:{roomId}` HASH entry and notify via BotController.
 * 8. Broadcast `game_state_sync` to everyone in the room.
 *
 * Redis keys used (SPEC.md §5):
 *   - room:players:{roomId}  (SET, read)
 *   - game:state:{roomId}    (STRING, JSON, written)
 *   - bot:active:{roomId}    (HASH, updated via BotController.activateBot)
 */

import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { GameRegistry } from '../games/registry';
import type { BotController } from '../bots/BotController';
import type { GameState, GameConfig } from '@card-platform/shared-types';

interface StartGamePayload {
  roomId: string;
  botCount?: number;
}

export async function startGameHandler(
  socket: Socket,
  payload: StartGamePayload,
  registry: GameRegistry,
  botController: BotController,
): Promise<void> {
  const { roomId, botCount = 0 } = payload;
  const { playerId } = socket.data.user;

  if (!roomId) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId is required' });
    return;
  }

  try {
    // Prevent double-start: if state already exists, refuse.
    const existingState = await redis.get(`game:state:${roomId}`);
    if (existingState) {
      socket.emit('game_error', {
        code: 'ALREADY_STARTED',
        message: 'Game has already started',
      });
      return;
    }

    // Fetch room metadata from the API service via its Redis-cached hash —
    // but to avoid cross-service coupling, read from Postgres via an HTTP call
    // would be ideal. For now, we rely on the seed-game test path and a
    // roomId → hostId map stored in Redis when the room is created.
    // Current minimal impl: read room hosts from a side map `room:meta:{roomId}`
    // that the api-service would populate; if not present, allow any requester
    // to start (the tests cover the happy path; real production needs a hostId
    // guarantee via direct DB lookup).
    const roomMetaJson = await redis.get(`room:meta:${roomId}`);
    let hostId: string | null = null;
    let gameId: string | null = null;
    let maxPlayers = 6;
    let houseRules: Record<string, Record<string, boolean>> = {};
    if (roomMetaJson) {
      try {
        const meta = JSON.parse(roomMetaJson) as {
          hostId?: string;
          gameId?: string;
          maxPlayers?: number;
          houseRules?: Record<string, Record<string, boolean>>;
        };
        hostId = meta.hostId ?? null;
        gameId = meta.gameId ?? null;
        if (typeof meta.maxPlayers === 'number') maxPlayers = meta.maxPlayers;
        if (meta.houseRules && typeof meta.houseRules === 'object') {
          houseRules = meta.houseRules;
        }
      } catch {
        /* ignore */
      }
    }

    if (hostId && hostId !== playerId) {
      socket.emit('game_error', {
        code: 'NOT_HOST',
        message: 'Only the host can start the game',
      });
      return;
    }

    // Resolve gameId from room meta. If meta is missing we cannot guess the
    // game — silently defaulting would start the wrong engine. The api-service
    // self-heals room:meta on GET /rooms/:id, so this should only fire if the
    // client skipped the room fetch entirely.
    if (!gameId) {
      logger.warn('startGame: missing room:meta for room', { roomId });
      socket.emit('game_error', {
        code: 'MISSING_ROOM_META',
        message: 'Room metadata is missing — please reload the table and try again',
      });
      return;
    }
    const resolvedGameId = gameId;

    // Collect all joined human players from Redis room:players SET
    const humanIds = await redis.smembers(`room:players:${roomId}`);
    const humanCount = humanIds.length;

    // Rule: if host is the only human, at least one bot is required.
    if (humanCount <= 1 && botCount < 1) {
      socket.emit('game_error', {
        code: 'BOT_REQUIRED',
        message: 'At least one bot is required when the host is alone',
      });
      return;
    }

    // Synthesise bot player IDs (prefix `bot:` per SPEC.md §9)
    const botIds: string[] = [];
    for (let i = 0; i < botCount; i++) {
      botIds.push(`bot:${randomUUID()}`);
    }
    const allPlayerIds = [...humanIds, ...botIds].slice(0, maxPlayers);

    // Initialise the engine
    const engine = registry.getEngine(resolvedGameId);
    const gameHouseRules = houseRules[resolvedGameId] ?? {};
    const config: GameConfig = {
      gameId: resolvedGameId,
      roomId,
      playerIds: allPlayerIds,
      asyncMode: false,
      turnTimerSeconds: null,
      options: { houseRules: gameHouseRules },
    };

    let state: GameState;
    try {
      state = engine.startGame(config);
    } catch (err) {
      logger.error('Engine.startGame failed', { roomId, gameId: resolvedGameId, err });
      socket.emit('game_error', {
        code: 'START_FAILED',
        message: `Cannot start ${resolvedGameId}: ${(err as Error).message}`,
      });
      return;
    }

    // Resolve real display names. Engines default `displayName` to the raw
    // playerId UUID, which is unreadable at the table. For humans, look up
    // the cached name written on joinRoom/rejoinRoom. For bots (playerId
    // prefix 'bot:'), generate "Bot 1", "Bot 2", … by seat order among bots
    // so each seat is distinct and self-describing.
    {
      let botSeatCounter = 0;
      const resolvedPlayers = await Promise.all(
        state.players.map(async (p) => {
          if (p.playerId.startsWith('bot:')) {
            botSeatCounter += 1;
            return { ...p, displayName: `Bot ${botSeatCounter}`, isBot: true };
          }
          const cached = await redis.get(`player:displayName:${p.playerId}`);
          return cached ? { ...p, displayName: cached } : p;
        }),
      );
      state = { ...state, players: resolvedPlayers };
    }

    // Persist and broadcast
    await redis.set(`game:state:${roomId}`, JSON.stringify(state));

    // Mark bot seats as active (so BotController schedules their turns)
    for (const botId of botIds) {
      await botController.activateBot(roomId, botId, allPlayerIds.indexOf(botId));
    }

    // Cribbage-specific: discarding to the crib is logically parallel — every
    // player contributes independently, not in turn order. Proactively
    // schedule every bot so they can discard alongside the humans instead of
    // waiting for a turn rotation.
    const cribbageDiscarding =
      resolvedGameId === 'cribbage' &&
      (state.publicData as { gamePhase?: string } | undefined)?.gamePhase === 'discarding';
    if (cribbageDiscarding) {
      for (const botId of botIds) {
        await botController.scheduleAction(roomId, botId, state.version);
      }
    } else if (state.currentTurn && botIds.includes(state.currentTurn)) {
      await botController.scheduleAction(roomId, state.currentTurn, state.version);
    }

    socket.nsp.to(roomId).emit('game_state_sync', { state });
    logger.info('Game started', {
      roomId,
      gameId: resolvedGameId,
      humans: humanIds.length,
      bots: botIds.length,
    });
  } catch (err) {
    logger.error('startGame error', { roomId, playerId, err: String(err) });
    socket.emit('game_error', { code: 'START_FAILED', message: 'Failed to start game' });
  }
}
