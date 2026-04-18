/**
 * BotPlayer
 *
 * Executes bot actions with triple fallback chain per SPEC.md §9 and architecture doc:
 *  1. strategy.chooseAction
 *  2. strategy.fallbackAction (if chooseAction throws)
 *  3. rightmost card discard (if fallbackAction also throws)
 *
 * Redis keys used (SPEC.md §5):
 *   bot:active:{roomId}           HASH
 *   bot:queue:{roomId}:{playerId} STRING
 *   game:lock:{roomId}            STRING TTL:5s
 *   game:state:{roomId}           STRING JSON
 *   game:actions:{roomId}         LIST
 *   replay:actions:{roomId}       LIST
 */

import { randomUUID } from 'crypto';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { GameState, PlayerAction, GameAction } from '@card-platform/shared-types';
import type { GameRegistry } from '../games/registry';
import type { BotController } from './BotController';
import { GenericBotStrategy } from './strategies/generic.strategy';
import { scheduleBotsAfterAction } from './schedulingHelpers';
import type { Server } from 'socket.io';

/**
 * Lazily get the Socket.io Server instance.
 * Uses dynamic require to avoid circular import at module evaluation time.
 */
function tryGetIO(): Server | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../index') as { getIO: () => Server };
    return mod.getIO();
  } catch {
    return null;
  }
}

const LOCK_TTL_SECONDS = 5;
const SERVER_ID = randomUUID();

export class BotPlayer {
  constructor(
    private readonly registry: GameRegistry,
    private readonly botController: BotController,
  ) {}

  /**
   * Execute one bot action for botPlayerId in roomId.
   * Follows the full abort-and-fallback protocol described in the architecture doc.
   */
  async executeAction(
    roomId: string,
    botPlayerId: string,
    scheduledForVersion?: number,
  ): Promise<void> {
    // 1. Check bot:active HEXISTS — abort if missing
    const isActive = await redis.hexists(`bot:active:${roomId}`, botPlayerId);
    if (!isActive) {
      logger.debug('BotPlayer: bot not active, aborting', { roomId, botPlayerId });
      return;
    }

    // 2. Check bot:queue exists — abort if missing (stale/cancelled)
    const queueExists = await redis.exists(`bot:queue:${roomId}:${botPlayerId}`);
    if (!queueExists) {
      logger.debug('BotPlayer: bot queue missing, aborting (stale)', { roomId, botPlayerId });
      return;
    }

    // Record fire attempt so BotSweeper doesn't re-fire a turn that's actively
    // executing (and so the sweeper's refireIntervalMs bookkeeping is correct
    // even when this invocation ultimately aborts below).
    await redis
      .hset(`bot:schedule:${roomId}:${botPlayerId}`, 'lastFireAt', String(Date.now()))
      .catch(() => {
        // schedule hash may have been cleaned up; not fatal
      });

    // 2b. Version guard — if the game has advanced past the version this turn
    // was scheduled for, this job is a stale replay (BullMQ retry after the
    // real turn already resolved). Skip it.
    if (typeof scheduledForVersion === 'number') {
      const snapshot = await redis.get(`game:state:${roomId}`);
      if (snapshot) {
        try {
          const { version } = JSON.parse(snapshot) as { version: number };
          if (typeof version === 'number' && version > scheduledForVersion) {
            logger.debug('BotPlayer: state advanced past scheduled version, skipping', {
              roomId,
              botPlayerId,
              scheduledForVersion,
              currentVersion: version,
            });
            return;
          }
        } catch {
          // fall through — missing/corrupt snapshot handled below
        }
      }
    }

    // 3. Acquire game:lock via SET NX EX 5
    const lockAcquired = await redis.set(
      `game:lock:${roomId}`,
      SERVER_ID,
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );
    if (!lockAcquired) {
      logger.warn('BotPlayer: failed to acquire game lock, aborting', { roomId, botPlayerId });
      return;
    }

    try {
      // 4. GET game:state
      const stateJson = await redis.get(`game:state:${roomId}`);
      if (!stateJson) {
        logger.warn('BotPlayer: no game state found', { roomId });
        return;
      }

      const state: GameState = JSON.parse(stateJson);

      // 5. Determine which engine and strategy to use
      let engine;
      try {
        engine = this.registry.getEngine(state.gameId);
      } catch {
        logger.error('BotPlayer: no engine for gameId', { gameId: state.gameId });
        return;
      }

      const strategy = this.registry.getStrategy(state.gameId) ?? new GenericBotStrategy(state.gameId);

      // 6. Choose action (triple fallback chain)
      let action: PlayerAction;
      try {
        action = strategy.chooseAction(state, botPlayerId);
      } catch (err) {
        logger.warn('BotPlayer: chooseAction failed, trying fallback', { roomId, botPlayerId, err: String(err) });
        try {
          action = strategy.fallbackAction(state, botPlayerId);
        } catch (err2) {
          logger.error('BotPlayer: fallbackAction also failed, using rightmost discard', {
            roomId,
            botPlayerId,
            err: String(err2),
          });
          action = this.rightmostDiscard(state, botPlayerId);
        }
      }

      // 7. Apply action via engine.
      //
      // 'pass' is a strategy-side signal meaning "I have nothing to do right
      // now" (e.g. parallel cribbage discard already complete, or it isn't my
      // turn). Engines reject it; treat it as a no-op: clear schedule keys so
      // the sweeper doesn't spin, and don't reschedule.
      if (action.type === 'pass') {
        await redis.del(`bot:queue:${roomId}:${botPlayerId}`);
        await redis.del(`bot:schedule:${roomId}:${botPlayerId}`);
        logger.debug('BotPlayer: strategy returned pass; nothing to do', {
          roomId,
          botPlayerId,
        });
        return;
      }

      // applyAction can reject a strategy-produced action (stale state,
      // misjudged rule). Without this catch the exception propagates past
      // the key-cleanup below, bot:queue stays set, and the sweeper replays
      // the same failing action forever — the bot appears stuck "thinking"
      // indefinitely. Budget one re-attempt with rightmostDiscard, then
      // force 'pass' so the room never waits > one think-cycle for us.
      let nextState: GameState;
      try {
        nextState = engine.applyAction(state, botPlayerId, action);
      } catch (err) {
        logger.warn('BotPlayer: engine rejected strategy action, retrying with rightmost discard', {
          roomId,
          botPlayerId,
          action: action.type,
          err: String(err),
        });
        try {
          const fallback = this.rightmostDiscard(state, botPlayerId);
          if (fallback.type === 'pass') {
            await redis.del(`bot:queue:${roomId}:${botPlayerId}`);
            await redis.del(`bot:schedule:${roomId}:${botPlayerId}`);
            return;
          }
          nextState = engine.applyAction(state, botPlayerId, fallback);
          action = fallback;
        } catch (err2) {
          logger.error('BotPlayer: rightmost-discard fallback also rejected; forcing pass', {
            roomId,
            botPlayerId,
            err: String(err2),
          });
          await redis.del(`bot:queue:${roomId}:${botPlayerId}`);
          await redis.del(`bot:schedule:${roomId}:${botPlayerId}`);
          return;
        }
      }

      // 8. Build action record (isBot: true per SPEC.md rule #11)
      const gameAction: GameAction = {
        id: randomUUID(),
        roomId,
        gameId: state.gameId,
        playerId: `bot:${botPlayerId}`,
        action,
        appliedAt: new Date().toISOString(),
        resultVersion: nextState.version,
        isBot: true,
      };

      // 9. Persist: SET game:state, RPUSH game:actions, RPUSH replay:actions
      await redis.set(`game:state:${roomId}`, JSON.stringify(nextState));
      await redis.rpush(`game:actions:${roomId}`, JSON.stringify(gameAction));
      await redis.rpush(`replay:actions:${roomId}`, JSON.stringify(gameAction));

      // 10. DEL bot:queue + bot:schedule (both gate sweeper re-fires)
      await redis.del(`bot:queue:${roomId}:${botPlayerId}`);
      await redis.del(`bot:schedule:${roomId}:${botPlayerId}`);

      // 11. Emit game_state_delta to room
      const delta = {
        version: nextState.version,
        roomId,
        playerUpdates: buildPlayerUpdates(state, nextState),
        currentTurn: nextState.currentTurn,
        phase: nextState.phase,
        publicData: nextState.publicData,
        updatedAt: nextState.updatedAt,
        ...(nextState.cribbageBoardState ? { cribbageBoardState: nextState.cribbageBoardState } : {}),
      };

      const io = tryGetIO();
      if (io) {
        io.of('/game').to(roomId).emit('game_state_delta', { delta });
      } else {
        logger.warn('BotPlayer: IO unavailable (likely test context)');
      }

      logger.info('BotPlayer: action applied', { roomId, botPlayerId, action: action.type, version: nextState.version });

      // 12. Post-action routing
      if (engine.isGameOver(nextState)) {
        await this.botController.deactivateAll(roomId);
      } else {
        await scheduleBotsAfterAction(nextState, this.botController);
      }
      // else: human's turn — turnTimer is handled separately
    } finally {
      // Always release the lock
      await redis.del(`game:lock:${roomId}`);
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Final fallback: discard the rightmost card in the bot's hand.
   * This must never throw.
   */
  private rightmostDiscard(state: GameState, botPlayerId: string): PlayerAction {
    const player = state.players.find((p) => p.playerId === botPlayerId);
    if (!player || player.hand.length === 0) {
      // Absolute last resort
      return { type: 'pass' };
    }
    const rightmost = player.hand[player.hand.length - 1];
    return { type: 'discard', cardIds: [rightmost.id] };
  }
}

/**
 * Build a partial playerUpdates map for the delta from state differences.
 */
function buildPlayerUpdates(
  prev: GameState,
  next: GameState,
): Record<string, Partial<import('@card-platform/shared-types').PlayerState>> {
  const updates: Record<string, Partial<import('@card-platform/shared-types').PlayerState>> = {};
  for (const nextPlayer of next.players) {
    const prevPlayer = prev.players.find((p) => p.playerId === nextPlayer.playerId);
    if (!prevPlayer || JSON.stringify(prevPlayer) !== JSON.stringify(nextPlayer)) {
      updates[nextPlayer.playerId] = nextPlayer;
    }
  }
  return updates;
}
