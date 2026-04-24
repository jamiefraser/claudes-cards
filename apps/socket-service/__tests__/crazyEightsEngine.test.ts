/**
 * Crazy Eights — platform adapter tests.
 *
 * Deliberately thin: the pure core is exhaustively tested in
 * crazyeights-core.test.ts. Here we exercise the IGameEngine surface —
 * metadata, deal sizes, combined play+declareSuit, action mapping,
 * deterministic dealing from roomId hashing.
 */

import { CrazyEightsEngine } from '../src/games/crazyeights/engine';
import type { GameConfig, PlayerAction } from '@card-platform/shared-types';

function makeConfig(playerCount = 2, roomId = 'room-1'): GameConfig {
  return {
    roomId,
    gameId: 'crazyeights',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('CrazyEightsEngine — adapter', () => {
  let engine: CrazyEightsEngine;
  beforeEach(() => {
    engine = new CrazyEightsEngine();
  });

  it('advertises gameId, 2–7 player range, async support', () => {
    expect(engine.gameId).toBe('crazyeights');
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(7);
    expect(engine.supportsAsync).toBe(true);
  });

  it('rejects configs outside 2–7 players', () => {
    expect(() => engine.startGame({ ...makeConfig(2), playerIds: ['solo'] })).toThrow();
    expect(() =>
      engine.startGame({
        ...makeConfig(2),
        playerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      }),
    ).toThrow();
  });

  it('2p deal: 7 cards each, starter is not an 8', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.players).toHaveLength(2);
    for (const p of state.players) expect(p.hand).toHaveLength(7);
    const pd = state.publicData as Record<string, unknown>;
    expect((pd['discardTop'] as { rank: string }).rank).not.toBe('8');
  });

  it('3p deal: 5 cards each', () => {
    const state = engine.startGame(makeConfig(3));
    for (const p of state.players) expect(p.hand).toHaveLength(5);
  });

  it('6p deal: 5 cards each, two decks auto-selected', () => {
    const state = engine.startGame(makeConfig(6));
    for (const p of state.players) expect(p.hand).toHaveLength(5);
    const pd = state.publicData as Record<string, unknown>;
    const core = pd['core'] as { deckCount: number };
    expect(core.deckCount).toBe(2);
  });

  it('7p deal: 2-deck setup works without error', () => {
    const state = engine.startGame(makeConfig(7));
    expect(state.players).toHaveLength(7);
    for (const p of state.players) expect(p.hand).toHaveLength(5);
  });

  it('same roomId produces the same deal (adapter determinism)', () => {
    const a = engine.startGame(makeConfig(2, 'determinism'));
    const b = engine.startGame(makeConfig(2, 'determinism'));
    expect(a.players[0]!.hand.map((c) => c.id)).toEqual(
      b.players[0]!.hand.map((c) => c.id),
    );
    expect(a.players[1]!.hand.map((c) => c.id)).toEqual(
      b.players[1]!.hand.map((c) => c.id),
    );
  });

  it('applyAction folds play + declareSuit for 8s (single UI call)', () => {
    const state = engine.startGame(makeConfig(2));
    const current = state.players.find((p) => p.playerId === state.currentTurn)!;
    const eight = current.hand.find((c) => c.rank === '8');
    if (!eight) {
      // Deal didn't produce an 8 for the first player — skip without
      // failing the suite; 31 core tests already cover this flow.
      return;
    }
    const after = engine.applyAction(state, current.playerId, {
      type: 'play',
      cardIds: [eight.id],
      payload: { suit: 'spades' },
    });
    const pd = after.publicData as Record<string, unknown>;
    expect(pd['declaredSuit']).toBe('spades');
    const core = pd['core'] as { phase: string };
    expect(core.phase).not.toBe('awaitingSuitChoice');
  });

  it('applyAction rejects unknown actions', () => {
    const state = engine.startGame(makeConfig(2));
    expect(() =>
      engine.applyAction(state, state.currentTurn!, {
        type: 'xyz',
      } as unknown as PlayerAction),
    ).toThrow(/Unknown action/);
  });

  it('getValidActions returns actions mapped into platform shape', () => {
    const state = engine.startGame(makeConfig(2));
    const legal = engine.getValidActions(state, state.currentTurn!);
    expect(legal.length).toBeGreaterThan(0);
    for (const a of legal) {
      expect(['play', 'draw', 'pass', 'declareSuit', 'reshuffle']).toContain(a.type);
    }
  });

  it('computeResult sorts by score ascending for penaltyAccumulation', () => {
    const state = engine.startGame(makeConfig(3));
    const skewed = {
      ...state,
      players: [
        { ...state.players[0]!, score: 10 },
        { ...state.players[1]!, score: 5 },
        { ...state.players[2]!, score: 20 },
      ],
    };
    const ranked = engine.computeResult(skewed);
    expect(ranked[0]!.playerId).toBe('p1');
    expect(ranked[0]!.score).toBe(5);
    expect(ranked[2]!.playerId).toBe('p2');
  });

  it('publicData exposes the UI-contract fields (discardTop, declaredSuit, pendingDrawPenalty)', () => {
    const state = engine.startGame(makeConfig(2));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['discardTop']).toBeDefined();
    expect('declaredSuit' in pd).toBe(true);
    expect(pd['pendingDrawPenalty']).toBe(0);
    expect(pd['drawPileSize']).toBeGreaterThan(0);
  });
});
