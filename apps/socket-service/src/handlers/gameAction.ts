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
import { scheduleBotsAfterAction } from '../bots/schedulingHelpers';
import { emitFilteredDelta } from '../utils/gameStateRedaction';

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

    // Validate turn — but skip for actions that are logically parallel and
    // therefore have no single "current" player. The engine still validates
    // turn ownership inside its own handlers for the strictly turn-based
    // actions (e.g. cribbage 'play' and 'go' check state.currentTurn).
    const PARALLEL_ACTIONS = new Set([
      // Cribbage: discarding to the crib is parallel; ack-count is turn-based
      // INSIDE the engine but the "current counter" is tracked separately
      // from state.currentTurn (which stays pinned to the pegging lead), so
      // it must not be gated by the global currentTurn check either.
      'discard-crib',
      'ack-count',
      // Phase 10: any player can ack the end-of-hand scoring overlay, in
      // any order, regardless of currentTurn (which is null once someone
      // went out).
      'ack-scoring',
    ]);
    if (!PARALLEL_ACTIONS.has(action.type) && state.currentTurn !== playerId) {
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

    // For ack-* actions: inject the set of currently-bot-controlled seats
    // into the action payload so the engine can treat them as already-
    // acknowledged. The engine can't see mid-game bot takeovers from
    // state alone (state.players[i].isBot is only the seat-level flag),
    // so this keeps the rule "bots never participate in ack" correct
    // regardless of how a seat became bot-controlled.
    const ACK_ACTIONS = new Set(['ack-scoring', 'ack-show', 'ack-count']);
    let effectiveAction = action;
    if (ACK_ACTIONS.has(action.type)) {
      const activeBotIds: string[] = [];
      for (const p of state.players) {
        if (botController.isBotActive(roomId, p.playerId)) {
          activeBotIds.push(p.playerId);
        }
      }
      effectiveAction = {
        ...action,
        payload: { ...(action.payload ?? {}), _activeBotIds: activeBotIds },
      };
    }

    // Apply action
    let nextState: GameState;
    try {
      nextState = engine.applyAction(state, playerId, effectiveAction);
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

    // Build delta. `prevVersion` lets each client detect gaps — if a delta
    // arrives where prevVersion !== currentlyAppliedVersion, the client has
    // missed an intermediate update and should request_resync.
    const delta: GameStateDelta = {
      version: nextState.version,
      prevVersion: state.version,
      roomId,
      playerUpdates: buildPlayerUpdates(state, nextState),
      currentTurn: nextState.currentTurn,
      phase: nextState.phase,
      publicData: nextState.publicData,
      updatedAt: nextState.updatedAt,
      ...(nextState.cribbageBoardState ? { cribbageBoardState: nextState.cribbageBoardState } : {}),
    };

    // Fan out per-recipient redacted copies so opponents never see each
    // other's hand cards. SPEC.md §22.
    await emitFilteredDelta(socket.nsp, roomId, delta);

    logger.info('gameAction applied', { roomId, playerId, action: action.type, version: nextState.version });

    // Post-action routing
    if (engine.isGameOver(nextState)) {
      await botController.deactivateAll(roomId);
    } else {
      await scheduleBotsAfterAction(nextState, botController);
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
