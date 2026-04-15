/**
 * Gin Rummy Bot Strategy
 *
 * - Draw from deck (always)
 * - If deadwood ≤ 10 at discard phase: knock
 * - Otherwise: discard highest deadwood card
 * - fallbackAction: discard rightmost card
 */

import type { IBotStrategy, GameState, PlayerAction, Card } from '@card-platform/shared-types';
import { computeDeadwood } from '../../games/ginrummy/engine';
import { logger } from '../../utils/logger';

interface GinRummyPublicData {
  turnPhase?: 'draw' | 'discard' | string;
  showdown?: {
    active: boolean;
    acked: string[];
    players: Array<{ playerId: string }>;
  };
}

function rankVal(rank: string): number {
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export class GinRummyBotStrategy implements IBotStrategy {
  readonly gameId = 'ginrummy';

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decide(state, botPlayerId);
    } catch (err) {
      logger.warn('GinRummyBotStrategy.chooseAction error', { error: String(err), botPlayerId });
      return this.fallbackAction(state, botPlayerId);
    }
  }

  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const player = state?.players?.find(p => p.playerId === botPlayerId);
      if (!player || player.hand.length === 0) return { type: 'pass' };
      const card = player.hand[player.hand.length - 1]!;
      return { type: 'discard', cardIds: [card.id] };
    } catch {
      return { type: 'pass' };
    }
  }

  private decide(state: GameState, botPlayerId: string): PlayerAction {
    const pd = state.publicData as unknown as GinRummyPublicData;

    if (pd.showdown?.active && !pd.showdown.acked.includes(botPlayerId)) {
      return { type: 'ack-show' };
    }

    const turnPhase = pd.turnPhase ?? 'draw';

    if (turnPhase === 'draw') {
      return { type: 'draw', payload: { source: 'deck' } };
    }

    const player = state.players.find(p => p.playerId === botPlayerId);
    if (!player || player.hand.length === 0) return { type: 'pass' };

    const deadwood = computeDeadwood(player.hand);
    if (deadwood <= 10) {
      return { type: 'knock' };
    }

    // Discard highest-value unmatched card
    const sorted = [...player.hand].sort((a, b) => rankVal(b.rank ?? 'A') - rankVal(a.rank ?? 'A'));
    return { type: 'discard', cardIds: [sorted[0]!.id] };
  }
}
