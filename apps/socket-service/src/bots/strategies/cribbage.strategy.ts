/**
 * Cribbage Bot Strategy
 *
 * - discarding phase: discard lowest-value cards to crib
 * - pegging phase: play highest card under 31; fallback = lowest playable
 * - fallbackAction: discard rightmost card or pass
 */

import type { IBotStrategy, GameState, PlayerAction, Card } from '@card-platform/shared-types';
import { cardValue } from '../../games/cribbage/engine.js';
import { logger } from '../../utils/logger';

interface CribbagePublicData {
  gamePhase?: 'discarding' | 'pegging' | 'counting' | 'ended' | string;
  pegCount?: number;
  discardedCount?: Record<string, number>;
  countingStep?: 'show' | 'crib';
  dealerIndex?: number;
}

export class CribbageBotStrategy implements IBotStrategy {
  readonly gameId = 'cribbage';

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decide(state, botPlayerId);
    } catch (err) {
      logger.warn('CribbageBotStrategy.chooseAction error', { error: String(err), botPlayerId });
      return this.fallbackAction(state, botPlayerId);
    }
  }

  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const player = state?.players?.find(p => p.playerId === botPlayerId);
      if (!player || player.hand.length === 0) return { type: 'pass' };
      const card = player.hand[player.hand.length - 1]!;
      // Determine whether to discard-crib or play based on phase
      const pd = state.publicData as unknown as CribbagePublicData;
      if (pd?.gamePhase === 'discarding') {
        return { type: 'discard-crib', cardIds: [card.id] };
      }
      if (pd?.gamePhase === 'counting') {
        return { type: 'ack-count' };
      }
      return { type: 'discard', cardIds: [card.id] };
    } catch {
      return { type: 'pass' };
    }
  }

  private decide(state: GameState, botPlayerId: string): PlayerAction {
    const pd = state.publicData as unknown as CribbagePublicData;
    const player = state.players.find(p => p.playerId === botPlayerId);
    if (!player) return { type: 'pass' };

    if (pd.gamePhase === 'discarding') {
      return this.decideDiscard(player.hand, pd, state.players.length, botPlayerId);
    }

    if (pd.gamePhase === 'pegging' && state.currentTurn === botPlayerId) {
      return this.decidePeg(player.hand, pd.pegCount ?? 0);
    }

    // Counting phase: only the dealer can acknowledge; if that's us, ack.
    if (pd.gamePhase === 'counting' && state.currentTurn === botPlayerId) {
      return { type: 'ack-count' };
    }

    // Default pass if not our turn or unknown phase
    return { type: 'pass' };
  }

  private decideDiscard(
    hand: Card[],
    pd: CribbagePublicData,
    playerCount: number,
    botPlayerId: string,
  ): PlayerAction {
    // Discard all remaining crib cards in a single action. Discarding is
    // logically parallel, so we don't wait for turns — just send everything
    // we owe at once, picking the lowest-valued cards.
    const needed = playerCount === 2 ? 2 : 1;
    const discarded = pd.discardedCount?.[botPlayerId] ?? 0;
    const remaining = Math.max(0, needed - discarded);
    if (remaining === 0) return { type: 'pass' };

    const sorted = [...hand].sort((a, b) => cardValue(a) - cardValue(b));
    const picks = sorted.slice(0, remaining);
    if (picks.length === 0) return { type: 'pass' };
    return { type: 'discard-crib', cardIds: picks.map(c => c.id) };
  }

  private decidePeg(hand: Card[], pegCount: number): PlayerAction {
    const playable = hand.filter(c => cardValue(c) + pegCount <= 31);
    if (playable.length === 0) return { type: 'go' };

    // Play highest card under 31
    const sorted = playable.sort((a, b) => cardValue(b) - cardValue(a));
    return { type: 'play', cardIds: [sorted[0]!.id] };
  }
}
