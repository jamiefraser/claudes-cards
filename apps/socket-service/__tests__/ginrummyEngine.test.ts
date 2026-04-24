/**
 * Gin Rummy — platform adapter tests.
 *
 * Deliberately thin: the pure core is exhaustively tested in
 * ginrummy-core.test.ts. These tests cover the IGameEngine surface —
 * metadata, deal shape, phase progression via frontend action types,
 * the auto-resolved layoff phase, and deterministic dealing.
 */

import { GinRummyEngine, computeDeadwood } from '../src/games/ginrummy/engine';
import type { GameConfig, PlayerAction, Card } from '@card-platform/shared-types';

function makeConfig(roomId = 'room-1'): GameConfig {
  return {
    roomId,
    gameId: 'ginrummy',
    playerIds: ['a', 'b'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('GinRummyEngine — adapter', () => {
  let engine: GinRummyEngine;
  beforeEach(() => {
    engine = new GinRummyEngine();
  });

  it('advertises gameId, strictly 2 players, async support', () => {
    expect(engine.gameId).toBe('ginrummy');
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(2);
    expect(engine.supportsAsync).toBe(true);
  });

  it('rejects non-2-player configs', () => {
    expect(() =>
      engine.startGame({ ...makeConfig(), playerIds: ['only-a'] }),
    ).toThrow();
    expect(() =>
      engine.startGame({ ...makeConfig(), playerIds: ['a', 'b', 'c'] }),
    ).toThrow();
  });

  it('initial deal: 10 cards each, one card on discard, stock has rest', () => {
    const state = engine.startGame(makeConfig());
    for (const p of state.players) expect(p.hand).toHaveLength(10);
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['discardTop']).toBeDefined();
    expect(pd['drawPileSize']).toBe(31);
  });

  it('starts in the first-turn-offer phase (non-dealer is current)', () => {
    const state = engine.startGame(makeConfig());
    const pd = state.publicData as Record<string, unknown>;
    const core = pd['core'] as { phase: string; currentPlayerIndex: number };
    expect(core.phase).toBe('firstTurnOffer');
    // Non-dealer is seat 1 by default (dealerIndex: 0).
    expect(core.currentPlayerIndex).toBe(1);
    expect(state.currentTurn).toBe('b');
  });

  it('turnPhase in publicData reflects the current core phase', () => {
    const state = engine.startGame(makeConfig());
    const pd = state.publicData as Record<string, unknown>;
    // Draw / first-turn-offer maps to turnPhase: 'draw' for the UI.
    expect(pd['turnPhase']).toBe('draw');
  });

  it('`draw` with source=discard during first-turn-offer takes the upcard', () => {
    const state = engine.startGame(makeConfig());
    const after = engine.applyAction(state, 'b', {
      type: 'draw',
      payload: { source: 'discard' },
    });
    const pdBefore = state.publicData as Record<string, unknown>;
    const pdAfter = after.publicData as Record<string, unknown>;
    // Discard top changes (was consumed) and player b now has 11 cards.
    const b = after.players.find((p) => p.playerId === 'b')!;
    expect(b.hand.length).toBe(11);
    expect(pdAfter['turnPhase']).toBe('discard');
  });

  it('`draw` with source=deck during first-turn-offer passes the offer', () => {
    const state = engine.startGame(makeConfig());
    const after = engine.applyAction(state, 'b', {
      type: 'draw',
      payload: { source: 'deck' },
    });
    const pd = after.publicData as Record<string, unknown>;
    const core = pd['core'] as { phase: string };
    expect(core.phase).toBe('firstTurnOfferDealer');
  });

  it('full pass-through to normal draw after both first-turn passes', () => {
    let s = engine.startGame(makeConfig());
    s = engine.applyAction(s, 'b', { type: 'draw', payload: { source: 'deck' } });
    s = engine.applyAction(s, 'a', { type: 'draw', payload: { source: 'deck' } });
    const pd = s.publicData as Record<string, unknown>;
    const core = pd['core'] as { phase: string };
    expect(core.phase).toBe('awaitingDraw');
    expect(s.currentTurn).toBe('b');
  });

  it('applyAction rejects unknown actions', () => {
    const state = engine.startGame(makeConfig());
    expect(() =>
      engine.applyAction(state, 'b', { type: 'xyz' } as unknown as PlayerAction),
    ).toThrow(/Unknown action/);
  });

  it('getValidActions returns draw options during first-turn-offer', () => {
    const state = engine.startGame(makeConfig());
    const legal = engine.getValidActions(state, 'b');
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.some((a) => a.type === 'draw' && a.payload?.['source'] === 'discard')).toBe(true);
    expect(legal.some((a) => a.type === 'draw' && a.payload?.['source'] === 'deck')).toBe(true);
  });

  it('same roomId produces the same deal', () => {
    const a = engine.startGame(makeConfig('determinism-test'));
    const b = engine.startGame(makeConfig('determinism-test'));
    expect(a.players[0]!.hand.map((c) => c.id)).toEqual(
      b.players[0]!.hand.map((c) => c.id),
    );
    expect(a.players[1]!.hand.map((c) => c.id)).toEqual(
      b.players[1]!.hand.map((c) => c.id),
    );
  });

  it('computeDeadwood helper returns the optimal deadwood for a hand', () => {
    // A+2+3♠ run, 4+5+6♥ run, 7♣7♦7♥ set, K♦ alone = 10 deadwood.
    const hand: Card[] = [
      { id: 'AS', deckType: 'standard', suit: 'spades', rank: 'A', value: 1, faceUp: true },
      { id: '2S', deckType: 'standard', suit: 'spades', rank: '2', value: 2, faceUp: true },
      { id: '3S', deckType: 'standard', suit: 'spades', rank: '3', value: 3, faceUp: true },
      { id: '4H', deckType: 'standard', suit: 'hearts', rank: '4', value: 4, faceUp: true },
      { id: '5H', deckType: 'standard', suit: 'hearts', rank: '5', value: 5, faceUp: true },
      { id: '6H', deckType: 'standard', suit: 'hearts', rank: '6', value: 6, faceUp: true },
      { id: '7C', deckType: 'standard', suit: 'clubs', rank: '7', value: 7, faceUp: true },
      { id: '7D', deckType: 'standard', suit: 'diamonds', rank: '7', value: 7, faceUp: true },
      { id: '7H', deckType: 'standard', suit: 'hearts', rank: '7', value: 7, faceUp: true },
      { id: 'KD', deckType: 'standard', suit: 'diamonds', rank: 'K', value: 13, faceUp: true },
    ];
    expect(computeDeadwood(hand)).toBe(10);
  });
});
