/**
 * Go Fish — platform adapter tests.
 *
 * Thin — the pure core is exhaustively covered in gofish-core.test.ts.
 */

import { GoFishEngine } from '../src/games/gofish/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 3, roomId = 'room-1'): GameConfig {
  return {
    roomId,
    gameId: 'gofish',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('GoFishEngine — adapter', () => {
  let engine: GoFishEngine;
  beforeEach(() => {
    engine = new GoFishEngine();
  });

  it('advertises gameId and 2–6 player range', () => {
    expect(engine.gameId).toBe('gofish');
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(6);
    expect(engine.supportsAsync).toBe(true);
  });

  it('rejects configs outside 2–6 players', () => {
    expect(() => engine.startGame({ ...makeConfig(2), playerIds: ['solo'] })).toThrow();
    expect(() =>
      engine.startGame({
        ...makeConfig(2),
        playerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }),
    ).toThrow();
  });

  it('deals 7 cards to each of 2–4 players (per spec)', () => {
    for (const count of [2, 3, 4]) {
      const state = engine.startGame(makeConfig(count));
      for (const p of state.players) {
        // Some hands may have fewer if a book was auto-laid at deal,
        // but the invariant is handCount + books*4 === dealSize.
        const cardsAccountedFor = p.hand.length; // books are separate
        const pd = state.publicData as Record<string, unknown>;
        const books = (pd['books'] as Record<string, string[]>)[p.playerId] ?? [];
        expect(cardsAccountedFor + books.length * 4).toBe(7);
      }
    }
  });

  it('deals 5 cards to each of 5–6 players', () => {
    for (const count of [5, 6]) {
      const state = engine.startGame(makeConfig(count));
      for (const p of state.players) {
        const pd = state.publicData as Record<string, unknown>;
        const books = (pd['books'] as Record<string, string[]>)[p.playerId] ?? [];
        expect(p.hand.length + books.length * 4).toBe(5);
      }
    }
  });

  it('starts in playing phase with a current turn assigned', () => {
    const state = engine.startGame(makeConfig(3));
    expect(state.phase).toBe('playing');
    expect(state.currentTurn).toBeTruthy();
  });

  it('same roomId produces the same deal', () => {
    const a = engine.startGame(makeConfig(3, 'deterministic'));
    const b = engine.startGame(makeConfig(3, 'deterministic'));
    for (let i = 0; i < 3; i++) {
      expect(a.players[i]!.hand.map((c) => c.id)).toEqual(
        b.players[i]!.hand.map((c) => c.id),
      );
    }
  });

  it('publicData exposes books, stockCount, askLog', () => {
    const state = engine.startGame(makeConfig(3));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['books']).toBeDefined();
    expect(typeof pd['stockCount']).toBe('number');
    expect(Array.isArray(pd['askLog'])).toBe(true);
  });

  it('getValidActions returns ask options for the current player only', () => {
    const state = engine.startGame(makeConfig(3));
    const currentId = state.currentTurn!;
    const legal = engine.getValidActions(state, currentId);
    expect(legal.length).toBeGreaterThan(0);
    for (const a of legal) expect(a.type).toBe('ask');
    // Non-current players get no actions.
    const other = state.players.find((p) => p.playerId !== currentId)!.playerId;
    expect(engine.getValidActions(state, other)).toEqual([]);
  });

  it('applyAction with ask payload advances state', () => {
    const state = engine.startGame(makeConfig(3));
    const legal = engine.getValidActions(state, state.currentTurn!);
    expect(legal.length).toBeGreaterThan(0);
    const first = legal[0]!;
    const after = engine.applyAction(state, state.currentTurn!, first);
    expect(after.version).toBeGreaterThan(state.version);
  });
});
