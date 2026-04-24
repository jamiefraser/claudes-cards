/**
 * War — platform adapter tests.
 *
 * These are deliberately thin — the pure game logic is exhaustively
 * tested in war-core.test.ts. Here we only cover the IGameEngine
 * surface: the adapter exposes the right metadata, projects core
 * state into the platform's PlayerState shape, and the 'flip' action
 * moves the game forward by one step.
 */

import { WarEngine } from '../src/games/war/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: `room-${playerCount}p`,
    gameId: 'war',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('WarEngine — adapter', () => {
  let engine: WarEngine;
  beforeEach(() => {
    engine = new WarEngine();
  });

  it('advertises gameId=war and 2–4 player range', () => {
    expect(engine.gameId).toBe('war');
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(4);
    expect(engine.supportsAsync).toBe(false);
  });

  it('rejects configs outside 2–4 players', () => {
    expect(() =>
      engine.startGame({ ...makeConfig(2), playerIds: ['only-one'] }),
    ).toThrow(/2–4|2-4|between/i);
    expect(() =>
      engine.startGame({
        ...makeConfig(2),
        playerIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
      }),
    ).toThrow();
  });

  it('2p deal: both sides get 26 face-down cards; phase=playing', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(2);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(26);
      for (const c of p.hand) expect(c.faceUp).toBe(false);
    }
  });

  it('3p deal: each side gets 17 cards (51 total, one removed)', () => {
    const state = engine.startGame(makeConfig(3));
    expect(state.players).toHaveLength(3);
    for (const p of state.players) expect(p.hand).toHaveLength(17);
    const total = state.players.reduce((n, p) => n + p.hand.length, 0);
    expect(total).toBe(51);
  });

  it('4p deal: each side gets 13 cards', () => {
    const state = engine.startGame(makeConfig(4));
    expect(state.players).toHaveLength(4);
    for (const p of state.players) expect(p.hand).toHaveLength(13);
  });

  it('getValidActions returns a single flip while the game is live', () => {
    const state = engine.startGame(makeConfig(2));
    expect(engine.getValidActions(state, 'p0')).toEqual([{ type: 'flip' }]);
    expect(engine.getValidActions(state, 'p1')).toEqual([{ type: 'flip' }]);
  });

  it('applyAction flip advances version and turnNumber', () => {
    const state = engine.startGame(makeConfig(2));
    const after = engine.applyAction(state, 'p0', { type: 'flip' });
    expect(after.version).toBe(state.version + 1);
    expect(after.turnNumber).toBe(state.turnNumber + 1);
  });

  it('applyAction rejects unknown actions', () => {
    const state = engine.startGame(makeConfig(2));
    expect(() =>
      engine.applyAction(state, 'p0', { type: 'draw' }),
    ).toThrow(/Unknown action/);
  });

  it('computeResult ranks by current hand size descending', () => {
    const state = engine.startGame(makeConfig(2));
    // Construct a skewed snapshot: p1 has all the cards.
    const skewed = {
      ...state,
      players: [
        { ...state.players[0]!, hand: [] },
        { ...state.players[1]!, hand: [...state.players[0]!.hand, ...state.players[1]!.hand] },
      ],
    };
    const ranked = engine.computeResult(skewed);
    expect(ranked[0]!.playerId).toBe('p1');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.playerId).toBe('p0');
    expect(ranked[1]!.rank).toBe(2);
  });

  it('same roomId produces the same deal (adapter determinism)', () => {
    const a = engine.startGame(makeConfig(2));
    const b = engine.startGame(makeConfig(2));
    // Card ids are stable (14S, 2H, …) so we can compare deal order.
    expect(a.players[0]!.hand.map((c) => c.id)).toEqual(
      b.players[0]!.hand.map((c) => c.id),
    );
    expect(a.players[1]!.hand.map((c) => c.id)).toEqual(
      b.players[1]!.hand.map((c) => c.id),
    );
  });

  it('publicData exposes atWar / tableCardCount / winnerId for the UI', () => {
    const state = engine.startGame(makeConfig(2));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['atWar']).toBe(false);
    expect(pd['tableCardCount']).toBe(0);
    expect(pd['winnerId']).toBeNull();
  });
});
