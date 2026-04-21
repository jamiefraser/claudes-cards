/**
 * Bot-scheduling helpers used after every applied action.
 *
 * The default rule — "schedule the bot if it's the bot's turn" — works for
 * strictly turn-based phases, but cribbage's *discarding* phase is logically
 * parallel: every player owes their own crib cards independently. We need to
 * kick every bot that still owes discards, not just the one that happens to
 * hold currentTurn.
 *
 * scheduleBotsAfterAction encapsulates both rules so handlers stay simple.
 */

import type { GameState } from '@card-platform/shared-types';
import type { BotController } from './BotController';
import { logger } from '../utils/logger';

interface CribbageDiscardingPublicData {
  gamePhase?: string;
  discardedCount?: Record<string, number>;
}

export async function scheduleBotsAfterAction(
  state: GameState,
  botController: BotController,
): Promise<void> {
  const roomId = state.roomId;
  if (!roomId) return;

  // Cribbage discarding — parallel: every bot that still owes cards gets a kick.
  const isCribbage = state.gameId === 'cribbage';
  const pd = state.publicData as unknown as CribbageDiscardingPublicData | undefined;
  if (isCribbage && pd?.gamePhase === 'discarding') {
    const needed = state.players.length === 2 ? 2 : 1;
    const counts = pd.discardedCount ?? {};
    for (const p of state.players) {
      if (!botController.isBotActive(roomId, p.playerId)) continue;
      const owes = needed - (counts[p.playerId] ?? 0);
      if (owes > 0) {
        logger.debug('scheduleBotsAfterAction: kicking cribbage bot for parallel discard', {
          roomId,
          botPlayerId: p.playerId,
          owes,
        });
        await botController.scheduleAction(roomId, p.playerId, state.version);
      }
    }
    return;
  }

  // Phase 10 scoring — parallel: currentTurn is null while the hand-end
  // overlay is shown, so the default turn-based scheduler won't fire. Kick
  // every bot that still owes an ack-scoring. Humans ack at their own pace
  // via the client.
  const isPhase10 = state.gameId === 'phase10';
  if (isPhase10 && state.phase === 'scoring') {
    const scoringPD = state.publicData as unknown as { scoringAcks?: string[] } | undefined;
    const acks = new Set(scoringPD?.scoringAcks ?? []);
    for (const p of state.players) {
      if (!botController.isBotActive(roomId, p.playerId)) continue;
      if (acks.has(p.playerId)) continue;
      logger.debug('scheduleBotsAfterAction: kicking phase10 bot to ack scoring', {
        roomId,
        botPlayerId: p.playerId,
      });
      await botController.scheduleAction(roomId, p.playerId, state.version);
    }
    return;
  }

  // Default — strictly turn-based.
  if (state.currentTurn && botController.isBotActive(roomId, state.currentTurn)) {
    await botController.scheduleAction(roomId, state.currentTurn, state.version);
  }
}
