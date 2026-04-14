/**
 * Rummy Bot Strategy
 *
 * - Always draw from deck
 * - Discard rightmost non-meld card; fallback = rightmost card
 */

import type { IBotStrategy, GameState, PlayerAction, Card } from '@card-platform/shared-types';
import { logger } from '../../utils/logger';

interface RummyPublicData {
  turnPhase?: 'draw' | 'discard' | string;
  discardTop?: Card | null;
}

export class RummyBotStrategy implements IBotStrategy {
  readonly gameId = 'rummy';

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decide(state, botPlayerId);
    } catch (err) {
      logger.warn('RummyBotStrategy.chooseAction error', { error: String(err), botPlayerId });
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
    const pd = state.publicData as unknown as RummyPublicData;
    const turnPhase = pd.turnPhase ?? 'draw';

    if (turnPhase === 'draw') {
      return { type: 'draw', payload: { source: 'deck' } };
    }

    const player = state.players.find(p => p.playerId === botPlayerId);
    if (!player || player.hand.length === 0) return { type: 'pass' };

    // Discard rightmost card
    const card = player.hand[player.hand.length - 1]!;
    return { type: 'discard', cardIds: [card.id] };
  }
}
