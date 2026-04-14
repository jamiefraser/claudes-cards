/**
 * Generic Bot Strategy Tests
 */

import { GenericBotStrategy } from '../src/bots/strategies/generic.strategy';
import type { GameState } from '@card-platform/shared-types';

function makeState(handCards: Array<{ id: string }>): GameState {
  return {
    version: 1,
    roomId: 'room-1',
    gameId: 'generic',
    phase: 'playing',
    players: [
      {
        playerId: 'bot-1',
        displayName: 'Bot',
        hand: handCards.map((c) => ({
          id: c.id,
          deckType: 'standard' as const,
          suit: 'hearts' as const,
          rank: '2' as const,
          value: 2,
          faceUp: false,
        })),
        score: 0,
        isOut: false,
        isBot: true,
      },
    ],
    currentTurn: 'bot-1',
    turnNumber: 1,
    roundNumber: 1,
    publicData: {},
    updatedAt: new Date().toISOString(),
  };
}

describe('GenericBotStrategy', () => {
  let strategy: GenericBotStrategy;

  beforeEach(() => {
    strategy = new GenericBotStrategy('generic');
  });

  it('has the correct gameId', () => {
    expect(strategy.gameId).toBe('generic');
  });

  it('chooseAction returns draw action', () => {
    const state = makeState([{ id: 'c1' }, { id: 'c2' }]);
    const action = strategy.chooseAction(state, 'bot-1');
    expect(action.type).toBe('draw');
  });

  it('fallbackAction returns discard of rightmost card', () => {
    const state = makeState([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
    const action = strategy.fallbackAction(state, 'bot-1');
    expect(action.type).toBe('discard');
    expect(action.cardIds).toEqual(['c3']);
  });

  it('fallbackAction returns pass when hand is empty', () => {
    const state = makeState([]);
    const action = strategy.fallbackAction(state, 'bot-1');
    expect(action.type).toBe('pass');
  });

  it('fallbackAction returns pass when player not found', () => {
    const state = makeState([{ id: 'c1' }]);
    const action = strategy.fallbackAction(state, 'unknown-player');
    expect(action.type).toBe('pass');
  });

  it('fallbackAction never throws', () => {
    const state = makeState([{ id: 'c1' }]);
    expect(() => strategy.fallbackAction(state, 'bot-1')).not.toThrow();
  });
});
