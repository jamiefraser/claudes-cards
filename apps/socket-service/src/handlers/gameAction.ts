/**
 * gameAction Handler
 *
 * Handles the game_action event on the /game namespace.
 * - Validates it is the player's turn
 * - Acquires game:lock
 * - Applies action via engine.applyAction
 * - Persists state, game:actions, replay:actions
 * - Broadcasts game_state_delta
 * - Schedules bot action if next turn is a bot
 */

import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { GameActionPayload, GameState, GameAction, GameStateDelta } from '@card-platform/shared-types';
import type { GameRegistry } from '../games/registry';
import type { BotController } from '../bots/BotController';

const LOCK_TTL_SECONDS = 5;
const SERVER_ID = randomUUID();

export async function gameActionHandler(
  socket: Socket,
  payload: GameActionPayload,
  registry: GameRegistry,
  botController: BotController,
): Promise<void> {
  const { roomId, action } = payload;
  const { playerId } = socket.data.user;

  if (!roomId || !action) {
    socket.emit('game_error', { code: 'INVALID_PAYLOAD', message: 'roomId and action are required' });
    return;
  }

  // Acquire game lock
  const lockAcquired = await redis.set(
    `game:lock:${roomId}`,
    SERVER_ID,
    'EX',
    LOCK_TTL_SECONDS,
    'NX',
  );
  if (!lockAcquired) {
    socket.emit('game_error', { code: 'LOCK_FAILED', message: 'Game is busy, try again' });
    return;
  }

  try {
    // GET game state
    const stateJson = await redis.get(`game:state:${roomId}`);
    if (!stateJson) {
      socket.emit('game_error', { code: 'NO_STATE', message: 'No game state found for this room' });
      return;
    }

    const state: GameState = JSON.parse(stateJson);

    // Validate turn
    if (state.currentTurn !== playerId) {
      socket.emit('game_error', { code: 'NOT_YOUR_TURN', message: 'It is not your turn' });
      return;
    }

    // Get engine
    let engine;
    try {
      engine = registry.getEngine(state.gameId);
    } catch {
      socket.emit('game_error', { code: 'UNKNOWN_GAME', message: `No engine for game: ${state.gameId}` });
      return;
    }

    // Apply action
    let nextState: GameState;
    try {
      nextState = engine.applyAction(state, playerId, action);
    } catch (err) {
      logger.warn('gameAction: applyAction failed', { roomId, playerId, action: action.type, err: String(err) });
      socket.emit('game_error', { code: 'INVALID_ACTION', message: String(err) });
      return;
    }

    // Build game action record (isBot: false for human actions)
    const gameAction: GameAction = {
      id: randomUUID(),
      roomId,
      gameId: state.gameId,
      playerId,
      action,
      appliedAt: new Date().toISOString(),
      resultVersion: nextState.version,
      isBot: false,
    };

    // Persist
    await redis.set(`game:state:${roomId}`, JSON.stringify(nextState));
    await redis.rpush(`game:actions:${roomId}`, JSON.stringify(gameAction));
    await redis.rpush(`replay:actions:${roomId}`, JSON.stringify(gameAction));

    // Build delta
    const delta: GameStateDelta = {
      version: nextState.version,
      roomId,
      playerUpdates: buildPlayerUpdates(state, nextState),
      currentTurn: nextState.currentTurn,
      phase: nextState.phase,
      publicData: nextState.publicData,
      updatedAt: nextState.updatedAt,
      ...(nextState.cribbageBoardState ? { cribbageBoardState: nextState.cribbageBoardState } : {}),
    };

    // Broadcast delta to room
    socket.nsp.to(roomId).emit('game_state_delta', { delta });

    logger.info('gameAction applied', { roomId, playerId, action: action.type, version: nextState.version });

    // Post-action routing
    if (engine.isGameOver(nextState)) {
      await botController.deactivateAll(roomId);
    } else if (nextState.currentTurn && botController.isBotActive(roomId, nextState.currentTurn)) {
      await botController.scheduleAction(roomId, nextState.currentTurn);
    }
  } finally {
    await redis.del(`game:lock:${roomId}`);
  }
}

function buildPlayerUpdates(prev: GameState, next: GameState) {
  const updates: Record<string, Partial<import('@card-platform/shared-types').PlayerState>> = {};
  for (const nextPlayer of next.players) {
    const prevPlayer = prev.players.find((p) => p.playerId === nextPlayer.playerId);
    if (!prevPlayer || JSON.stringify(prevPlayer) !== JSON.stringify(nextPlayer)) {
      updates[nextPlayer.playerId] = nextPlayer;
    }
  }
  return updates;
}
