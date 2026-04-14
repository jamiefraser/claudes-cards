/**
 * Generic Bot Strategy
 *
 * Fallback strategy used when no game-specific strategy is registered.
 * Always draws from pile, then discards the rightmost card in hand.
 * fallbackAction must never throw per IBotStrategy contract (SPEC.md §9.4).
 */

import type { IBotStrategy, GameState, PlayerAction } from '@card-platform/shared-types';

export class GenericBotStrategy implements IBotStrategy {
  constructor(public readonly gameId: string) {}

  /**
   * Draw from the draw pile (primary action).
   * For a generic strategy, always draw — the engine will manage validity.
   */
  chooseAction(_state: GameState, _botPlayerId: string): PlayerAction {
    return { type: 'draw' };
  }

  /**
   * Fallback: discard the rightmost card in the bot's hand.
   * This method MUST never throw per SPEC.md §9.4.
   */
  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const player = state.players.find((p) => p.playerId === botPlayerId);
      if (!player || player.hand.length === 0) {
        return { type: 'pass' };
      }
      const rightmost = player.hand[player.hand.length - 1];
      return { type: 'discard', cardIds: [rightmost.id] };
    } catch {
      // Absolute safety net
      return { type: 'pass' };
    }
  }
}
