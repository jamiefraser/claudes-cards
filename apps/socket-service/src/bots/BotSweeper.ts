/**
 * BotSweeper — at-least-once delivery backstop for bot turns.
 *
 * The primary bot-turn delivery path is:
 *   BotController.scheduleAction → BullMQ delayed job → worker processor
 *     → redis.publish('bot:action:{roomId}', {type:'execute'})
 *     → socket-service subscriber → BotPlayer.executeAction
 *
 * BullMQ + delayed jobs give us durability against socket-service restarts,
 * but Redis pub/sub is fire-and-forget. If the subscriber is disconnected
 * at the exact moment of publish, the message is dropped and no retry
 * happens (the processor's publish call succeeded, so BullMQ considers the
 * job done).
 *
 * The sweeper closes that gap: every `intervalMs` it scans for
 * `bot:schedule:{roomId}:{playerId}` hashes whose think-time window has
 * elapsed without a successful completion (BotPlayer DELs the hash on
 * success). For any stale entry, it re-invokes BotPlayer.executeAction.
 * The version guard inside executeAction makes replays idempotent — if the
 * game state has already advanced past `scheduledForVersion`, the replay
 * is a no-op.
 *
 * Worst-case recovery latency for a lost message ≈ staleMs + intervalMs.
 */

import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { BotPlayer } from './BotPlayer';
import type { BotController } from './BotController';

export interface BotSweeperOptions {
  /** Sweep cadence. */
  intervalMs?: number;
  /** How long past scheduledAt we consider an entry "stuck" and worth re-firing. */
  staleMs?: number;
  /** Minimum gap between successive re-fires for the same bot turn. */
  refireIntervalMs?: number;
}

const DEFAULTS = {
  intervalMs: 5_000,
  staleMs: 7_500, // max think time (2.5s) + 5s grace
  refireIntervalMs: 10_000,
};

export class BotSweeper {
  private timer: NodeJS.Timeout | null = null;
  private readonly opts: Required<BotSweeperOptions>;
  private inFlight = false;

  constructor(
    private readonly botPlayer: BotPlayer,
    private readonly botController: BotController | null = null,
    options: BotSweeperOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err: Error) => {
        logger.error('BotSweeper: tick failed', { err: err.message });
      });
    }, this.opts.intervalMs);
    this.timer.unref?.();
    logger.info('BotSweeper started', this.opts);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Exposed for tests and admin endpoints. */
  async tick(): Promise<void> {
    if (this.inFlight) return; // previous tick still running (slow Redis?)
    this.inFlight = true;
    try {
      const now = Date.now();
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          'bot:schedule:*',
          'COUNT',
          '100',
        );
        cursor = next;
        for (const key of keys) {
          await this.maybeRefire(key, now).catch((err: Error) => {
            logger.error('BotSweeper: refire failed', { key, err: err.message });
          });
        }
      } while (cursor !== '0');

      // Self-heal: find rooms where currentTurn is a registered bot but no
      // schedule entry exists. This happens after a service restart wiped the
      // in-memory bot cache (or an earlier scheduleAction silently failed).
      // Without this, the bot sits "Thinking..." forever.
      cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          'bot:active:*',
          'COUNT',
          '100',
        );
        cursor = next;
        for (const key of keys) {
          await this.maybeRescheduleStranded(key).catch((err: Error) => {
            logger.error('BotSweeper: stranded check failed', { key, err: err.message });
          });
        }
      } while (cursor !== '0');
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * For every active bot in the room, if the engine's currentTurn points at
   * that bot but there is no live `bot:schedule` entry, kick off a fresh
   * schedule. Idempotent (scheduleAction overwrites).
   */
  private async maybeRescheduleStranded(activeKey: string): Promise<void> {
    // activeKey = "bot:active:{roomId}"
    const roomId = activeKey.slice('bot:active:'.length);
    if (!roomId) return;

    const stateJson = await redis.get(`game:state:${roomId}`);
    if (!stateJson) return;
    type StuckState = {
      currentTurn?: string;
      version?: number;
      gameId?: string;
      players?: Array<{ playerId: string }>;
      publicData?: Record<string, unknown>;
    };
    let state: StuckState | null = null;
    try {
      state = JSON.parse(stateJson) as StuckState;
    } catch {
      return;
    }
    const currentTurn = state?.currentTurn;
    if (!currentTurn) return;

    const isBot = await redis.hexists(activeKey, currentTurn);
    if (!isBot) return;

    const scheduleKey = `bot:schedule:${roomId}:${currentTurn}`;
    const exists = await redis.exists(scheduleKey);
    if (exists) return;

    // Cribbage parallel-discard quirk: the engine pins `currentTurn` to the
    // non-dealer throughout discarding so it's queued up to lead pegging.
    // If the bot is the non-dealer and has already delivered its crib cards,
    // it has nothing to do — the engine is waiting on the human's discard.
    // Re-scheduling here would just spin (strategy returns 'pass' forever).
    if (state?.gameId === 'cribbage' && state.publicData) {
      const pd = state.publicData as {
        gamePhase?: string;
        discardedCount?: Record<string, number>;
      };
      if (pd.gamePhase === 'discarding') {
        const playerCount = state.players?.length ?? 2;
        const needed = playerCount === 2 ? 2 : 1;
        const done = (pd.discardedCount?.[currentTurn] ?? 0) >= needed;
        if (done) return;
      }
    }

    if (!this.botController) return;

    logger.warn('BotSweeper: stranded bot turn — rescheduling', {
      roomId,
      playerId: currentTurn,
      version: state?.version,
    });
    await this.botController.scheduleAction(roomId, currentTurn, state?.version);
  }

  private async maybeRefire(key: string, now: number): Promise<void> {
    // key = "bot:schedule:{roomId}:{playerId}"
    const parts = key.split(':');
    if (parts.length < 4) return;
    const roomId = parts[2];
    const playerId = parts.slice(3).join(':'); // tolerate playerIds with colons

    const data = await redis.hgetall(key);
    if (!data || !data.scheduledAt) return;

    const scheduledAt = Number(data.scheduledAt);
    const thinkTimeMs = Number(data.thinkTimeMs) || 0;
    const lastFireAt = Number(data.lastFireAt ?? '0') || 0;
    const scheduledForVersion = data.scheduledForVersion
      ? Number(data.scheduledForVersion)
      : undefined;

    const age = now - scheduledAt;
    const sinceLastFire = now - lastFireAt;

    // Not yet stuck — the normal delayed-job path still has time to fire.
    if (age < thinkTimeMs + this.opts.staleMs) return;
    // Recently re-fired — don't hammer.
    if (lastFireAt > 0 && sinceLastFire < this.opts.refireIntervalMs) return;

    // Claim the attempt first so a second sweeper (or the real job landing
    // mid-tick) doesn't double-fire.
    await redis.hset(key, 'lastFireAt', String(now));

    logger.warn('BotSweeper: replaying stuck bot turn', {
      roomId,
      playerId,
      ageMs: age,
      scheduledForVersion,
    });

    await this.botPlayer.executeAction(roomId, playerId, scheduledForVersion);
  }
}
