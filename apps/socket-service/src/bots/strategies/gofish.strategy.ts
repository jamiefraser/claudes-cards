/**
 * Go Fish Bot Strategy
 *
 * - Ask for rank matching most cards in hand (greedy)
 * - fallback: ask for lowest rank held, targeting first opponent
 */

import type { IBotStrategy, GameState, PlayerAction } from '@card-platform/shared-types';
import { logger } from '../../utils/logger';

export class GoFishBotStrategy implements IBotStrategy {
  readonly gameId = 'gofish';

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decide(state, botPlayerId);
    } catch (err) {
      logger.warn('GoFishBotStrategy.chooseAction error', { error: String(err), botPlayerId });
      return this.fallbackAction(state, botPlayerId);
    }
  }

  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const player = state?.players?.find(p => p.playerId === botPlayerId);
      if (!player || player.hand.length === 0) return { type: 'pass' };

      const opponent = state.players.find(p => p.playerId !== botPlayerId);
      if (!opponent) return { type: 'pass' };

      // Ask for lowest rank held
      const rank = player.hand[0]?.rank;
      if (!rank) return { type: 'pass' };

      return { type: 'ask', payload: { targetPlayerId: opponent.playerId, rank } };
    } catch {
      return { type: 'pass' };
    }
  }

  private decide(state: GameState, botPlayerId: string): PlayerAction {
    const player = state.players.find(p => p.playerId === botPlayerId);
    if (!player || player.hand.length === 0) return { type: 'pass' };

    const opponents = state.players.filter(p => p.playerId !== botPlayerId);
    if (opponents.length === 0) return { type: 'pass' };

    // Count cards by rank in hand
    const rankCount: Record<string, number> = {};
    for (const c of player.hand) {
      const r = c.rank ?? '';
      rankCount[r] = (rankCount[r] ?? 0) + 1;
    }

    // Find rank with most cards
    const bestRank = Object.entries(rankCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!bestRank) return this.fallbackAction(state, botPlayerId);

    return {
      type: 'ask',
      payload: { targetPlayerId: opponents[0]!.playerId, rank: bestRank },
    };
  }
}
