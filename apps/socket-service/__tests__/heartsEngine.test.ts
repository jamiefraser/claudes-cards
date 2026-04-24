/**
 * Hearts — platform adapter tests.
 *
 * Thin — detailed rule coverage (first-trick no-penalty, hearts-broken
 * monotonicity, shoot-the-moon, Q♠=13, J♦ variant) lives in
 * hearts-core.test.ts. Here we only assert the adapter surface:
 * metadata, 3–7 player range, deal sizes, pass-phase wiring,
 * publicData shape, determinism.
 */

import { HeartsEngine } from '../src/games/hearts/engine';
import type { GameConfig, PlayerAction } from '@card-platform/shared-types';

function makeConfig(playerCount = 4, roomId = 'room-test'): GameConfig {
  return {
    roomId,
    gameId: 'hearts',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('HeartsEngine — adapter', () => {
  let engine: HeartsEngine;
  beforeEach(() => { engine = new HeartsEngine(); });

  it('advertises gameId and 3–7 player range', () => {
    expect(engine.gameId).toBe('hearts');
    expect(engine.minPlayers).toBe(3);
    expect(engine.maxPlayers).toBe(7);
    expect(engine.supportsAsync).toBe(false);
  });

  it('rejects configs outside 3–7 players', () => {
    expect(() => engine.startGame({ ...makeConfig(3), playerIds: ['a', 'b'] })).toThrow();
    expect(() =>
      engine.startGame({
        ...makeConfig(3),
        playerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      }),
    ).toThrow();
  });

  it('4p: deals 13 cards to each player', () => {
    const state = engine.startGame(makeConfig(4));
    for (const p of state.players) expect(p.hand).toHaveLength(13);
  });

  it('3p and 5p use card-removal variants (not every hand is 13)', () => {
    // 3p: 51 cards / 3 = 17 each (2♣ removed per spec §10.7).
    const s3 = engine.startGame(makeConfig(3));
    for (const p of s3.players) expect(p.hand).toHaveLength(17);
    // 5p: 50 cards / 5 = 10 each (2♣ + 2♦ removed).
    const s5 = engine.startGame(makeConfig(5));
    for (const p of s5.players) expect(p.hand).toHaveLength(10);
  });

  it('starts in playing phase with pass turn-phase on round 1', () => {
    const state = engine.startGame(makeConfig(4));
    expect(state.phase).toBe('playing');
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['turnPhase']).toBe('pass');
    expect(pd['passDirection']).toBe('left');
  });

  it('same roomId produces the same deal (determinism via roomId hash)', () => {
    const a = engine.startGame(makeConfig(4, 'deterministic'));
    const b = engine.startGame(makeConfig(4, 'deterministic'));
    for (let i = 0; i < 4; i++) {
      expect(a.players[i]!.hand.map((c) => c.id))
        .toEqual(b.players[i]!.hand.map((c) => c.id));
    }
  });

  it('publicData exposes turnPhase, heartsBroken, passDirection, scoresTotal', () => {
    const state = engine.startGame(makeConfig(4));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['turnPhase']).toBeDefined();
    expect(pd['heartsBroken']).toBe(false);
    expect(pd['passDirection']).toBeDefined();
    expect(pd['scoresTotal']).toBeDefined();
    expect(pd['currentTrickCards']).toBeDefined();
  });

  it('getValidActions offers pass-candidate actions during pass phase', () => {
    const state = engine.startGame(makeConfig(4));
    // Pass-phase exposes per-card candidate actions so the UI can
    // compose a 3-card selection client-side.
    const actions = engine.getValidActions(state, 'p1');
    expect(actions.length).toBeGreaterThan(0);
  });

  it('applyAction pass with 3 cardIds advances state', () => {
    let state = engine.startGame(makeConfig(4));
    const p1 = state.players.find((p) => p.playerId === 'p1')!;
    const threeCards = p1.hand.slice(0, 3).map((c) => c.id);
    state = engine.applyAction(state, 'p1', { type: 'pass', cardIds: threeCards });
    expect(state.version).toBeGreaterThan(1);
  });

  it('pass rejects a selection that is not exactly 3 cards', () => {
    const state = engine.startGame(makeConfig(4));
    const p1 = state.players.find((p) => p.playerId === 'p1')!;
    expect(() =>
      engine.applyAction(state, 'p1', { type: 'pass', cardIds: [p1.hand[0]!.id] }),
    ).toThrow();
  });

  it('computeResult ranks by lowest score first (Hearts is avoidance)', () => {
    const state = engine.startGame(makeConfig(4));
    const ranks = engine.computeResult(state);
    expect(ranks).toHaveLength(4);
    // All rounds scores start at 0, so rankings are deterministic by insertion order.
    expect(ranks[0]!.rank).toBe(1);
  });

  it('isGameOver false at start', () => {
    const state = engine.startGame(makeConfig(4));
    expect(engine.isGameOver(state)).toBe(false);
  });
});
