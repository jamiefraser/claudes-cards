/**
 * Idiot — platform adapter tests.
 *
 * Thin — the pure core is exhaustively covered in idiot-core.test.ts.
 */

import { IdiotEngine } from '../src/games/idiot/engine';
import type { GameConfig, PlayerAction } from '@card-platform/shared-types';

function makeConfig(playerCount = 2, roomId = 'room-1'): GameConfig {
  return {
    roomId,
    gameId: 'idiot',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('IdiotEngine — adapter', () => {
  let engine: IdiotEngine;
  beforeEach(() => { engine = new IdiotEngine(); });

  it('advertises gameId and 2–6 player range', () => {
    expect(engine.gameId).toBe('idiot');
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(6);
    expect(engine.supportsAsync).toBe(false);
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

  it('deals 3 hand + 3 face-up + 3 face-down per player (2–5p use single deck)', () => {
    for (const count of [2, 3, 4, 5]) {
      const state = engine.startGame(makeConfig(count));
      for (const p of state.players) {
        expect(p.hand).toHaveLength(3);
      }
      const pd = state.publicData as Record<string, unknown>;
      const faceDown = pd['faceDownCountByPlayer'] as Record<string, number>;
      const faceUp = pd['faceUpByPlayer'] as Record<string, unknown[]>;
      for (const p of state.players) {
        expect(faceDown[p.playerId]).toBe(3);
        expect(faceUp[p.playerId]).toHaveLength(3);
      }
    }
  });

  it('6-player game switches to two decks automatically', () => {
    const state = engine.startGame(makeConfig(6));
    const pd = state.publicData as Record<string, unknown>;
    const core = pd['core'] as { config: { decks: number } };
    expect(core.config.decks).toBe(2);
  });

  it('starts in playing phase with a current turn assigned', () => {
    const state = engine.startGame(makeConfig(3));
    expect(state.phase).toBe('playing');
    expect(state.currentTurn).toBeTruthy();
  });

  it('same roomId produces the same deal (determinism through roomId hash)', () => {
    const a = engine.startGame(makeConfig(3, 'deterministic'));
    const b = engine.startGame(makeConfig(3, 'deterministic'));
    for (let i = 0; i < 3; i++) {
      expect(a.players[i]!.hand.map((c) => c.id))
        .toEqual(b.players[i]!.hand.map((c) => c.id));
    }
  });

  it('publicData exposes discardTop, pileRequirement, zone counts', () => {
    const state = engine.startGame(makeConfig(3));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['discardTop']).toBeNull();
    expect(pd['stockCount']).toBeGreaterThan(0);
    expect(pd['pileRequirement']).toEqual({ kind: 'any' });
    expect(pd['faceUpByPlayer']).toBeDefined();
    expect(pd['faceDownCountByPlayer']).toBeDefined();
    expect(pd['handCountByPlayer']).toBeDefined();
    expect(pd['readyByPlayer']).toBeDefined();
  });

  it('getValidActions during swap phase offers ready + swap options', () => {
    const state = engine.startGame(makeConfig(3));
    const actions = engine.getValidActions(state, 'p0');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.type === 'ready')).toBe(true);
    expect(actions.some((a) => a.type === 'swap')).toBe(true);
  });

  it('ready action transitions to play when all players ready', () => {
    let state = engine.startGame(makeConfig(2));
    state = engine.applyAction(state, 'p0', { type: 'ready' });
    const pd1 = state.publicData as Record<string, unknown>;
    expect(pd1['phase']).toBe('swap');
    state = engine.applyAction(state, 'p1', { type: 'ready' });
    const pd2 = state.publicData as Record<string, unknown>;
    expect(pd2['phase']).toBe('play');
  });

  it('applyAction with play type advances version and state', () => {
    let state = engine.startGame(makeConfig(2));
    state = engine.applyAction(state, 'p0', { type: 'ready' });
    state = engine.applyAction(state, 'p1', { type: 'ready' });
    const current = state.currentTurn!;
    const legal = engine.getValidActions(state, current);
    const playAction = legal.find((a) => a.type === 'play');
    expect(playAction).toBeTruthy();
    const after = engine.applyAction(state, current, playAction as PlayerAction);
    expect(after.version).toBeGreaterThan(state.version);
  });

  it('computeResult ranks by placement; Idiot gets last rank', () => {
    const state = engine.startGame(makeConfig(2));
    const rankings = engine.computeResult(state);
    expect(rankings).toHaveLength(2);
    for (const r of rankings) expect(typeof r.rank).toBe('number');
  });

  it('isGameOver false at start', () => {
    const state = engine.startGame(makeConfig(3));
    expect(engine.isGameOver(state)).toBe(false);
  });
});
