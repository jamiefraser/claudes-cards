/**
 * Crazy Eights Bot Strategy
 *
 * - Play matching card if possible (prefer non-8s; use 8 as last resort declaring most-held suit)
 * - If can't play: draw
 * - fallbackAction: draw or pass
 */

import type { IBotStrategy, GameState, PlayerAction, Card } from '@card-platform/shared-types';
import { logger } from '../../utils/logger';

interface CrazyEightsPublicData {
  discardTop?: Card | null;
  declaredSuit?: string | null;
  drawPileSize?: number;
}

function canPlay(card: Card, discardTop: Card | null, declaredSuit: string | null): boolean {
  if (card.rank === '8') return true;
  if (!discardTop) return true;
  const activeSuit = declaredSuit ?? discardTop.suit;
  return card.suit === activeSuit || card.rank === discardTop.rank;
}

function declareBestSuit(hand: Card[]): string {
  const counts: Record<string, number> = {};
  for (const c of hand) {
    if (c.rank !== '8' && c.suit) {
      counts[c.suit] = (counts[c.suit] ?? 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? 'hearts';
}

export class CrazyEightsBotStrategy implements IBotStrategy {
  readonly gameId = 'crazyeights';

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decide(state, botPlayerId);
    } catch (err) {
      logger.warn('CrazyEightsBotStrategy.chooseAction error', { error: String(err), botPlayerId });
      return this.fallbackAction(state, botPlayerId);
    }
  }

  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const pd = state?.publicData as unknown as CrazyEightsPublicData;
      if ((pd?.drawPileSize ?? 0) > 0) return { type: 'draw' };
      return { type: 'pass' };
    } catch {
      return { type: 'pass' };
    }
  }

  private decide(state: GameState, botPlayerId: string): PlayerAction {
    const pd = state.publicData as unknown as CrazyEightsPublicData;
    const player = state.players.find(p => p.playerId === botPlayerId);
    if (!player) return { type: 'pass' };

    const discardTop = pd.discardTop ?? null;
    const declaredSuit = pd.declaredSuit ?? null;

    // Find non-8 playable cards first
    const nonEights = player.hand.filter(c => c.rank !== '8' && canPlay(c, discardTop, declaredSuit));
    if (nonEights.length > 0) {
      return { type: 'play', cardIds: [nonEights[0]!.id] };
    }

    // Try an 8
    const eight = player.hand.find(c => c.rank === '8');
    if (eight) {
      const suit = declareBestSuit(player.hand);
      return { type: 'play', cardIds: [eight.id], payload: { suit } };
    }

    // Draw
    if ((pd.drawPileSize ?? 0) > 0) return { type: 'draw' };
    return { type: 'pass' };
  }
}
