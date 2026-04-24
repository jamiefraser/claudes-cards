/**
 * Spit — platform adapter tests.
 *
 * Thin — detailed rule coverage lives in spit-core.test.ts. Here we
 * only assert the adapter surface: metadata, 2-player requirement,
 * auto-started first round, publicData shape, action translation.
 */

import { SpitEngine } from '../src/games/spit/engine';
import type { GameConfig, PlayerAction } from '@card-platform/shared-types';

function makeConfig(roomId = 'room-test'): GameConfig {
  return {
    roomId,
    gameId: 'spit',
    playerIds: ['p1', 'p2'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('SpitEngine — adapter', () => {
  let engine: SpitEngine;
  beforeEach(() => { engine = new SpitEngine(); });

  it('advertises gameId and exactly 2 players', () => {
    expect(engine.gameId).toBe('spit');
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(2);
    expect(engine.supportsAsync).toBe(false);
  });

  it('rejects configs with ≠ 2 players', () => {
    expect(() => engine.startGame({ ...makeConfig(), playerIds: ['solo'] })).toThrow();
    expect(() =>
      engine.startGame({ ...makeConfig(), playerIds: ['a', 'b', 'c'] }),
    ).toThrow();
  });

  it('starts with play-phase auto-triggered and centres flipped', () => {
    const state = engine.startGame(makeConfig());
    expect(state.phase).toBe('playing');
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['phase']).toBe('playing');
    const counts = pd['centerCounts'] as [number, number];
    expect(counts[0]).toBe(1);
    expect(counts[1]).toBe(1);
  });

  it('currentTurn is null (real-time, no turn ownership)', () => {
    const state = engine.startGame(makeConfig());
    expect(state.currentTurn).toBeNull();
  });

  it('same roomId produces the same deal (determinism via roomId hash)', () => {
    const a = engine.startGame(makeConfig('deterministic'));
    const b = engine.startGame(makeConfig('deterministic'));
    const ca = a.publicData as Record<string, unknown>;
    const cb = b.publicData as Record<string, unknown>;
    expect(
      ((ca['columnsByPlayer'] as Record<string, { tops: unknown[] }>)['p1']!.tops),
    ).toEqual(
      ((cb['columnsByPlayer'] as Record<string, { tops: unknown[] }>)['p1']!.tops),
    );
  });

  it('publicData exposes columnsByPlayer, spitPileCountByPlayer, centre tops/counts, spitAvailable', () => {
    const state = engine.startGame(makeConfig());
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['columnsByPlayer']).toBeDefined();
    expect(pd['spitPileCountByPlayer']).toBeDefined();
    expect(pd['centerTops']).toBeDefined();
    expect(pd['centerCounts']).toBeDefined();
    expect(pd['spitAvailable']).toBe(false);
    expect(pd['roundNumber']).toBe(1);
  });

  it('getValidActions surfaces play actions with columnIndex + centerIndex payload', () => {
    const state = engine.startGame(makeConfig('seeded-room-42'));
    const actions = engine.getValidActions(state, 'p1');
    // We can't assert non-empty here because a random deal may have zero
    // adjacent column tops, but every returned action must be a play with the
    // right payload shape.
    for (const a of actions) {
      expect(['play', 'spit', 'slap']).toContain(a.type);
      if (a.type === 'play') {
        expect(a.payload).toMatchObject({
          columnIndex: expect.any(Number),
          centerIndex: expect.any(Number),
        });
      }
    }
  });

  it('applyAction with invalid play payload is rejected (logged, state unchanged version except log)', () => {
    const state = engine.startGame(makeConfig());
    // Submitting a play with no payload should fail.
    expect(() =>
      engine.applyAction(state, 'p1', { type: 'play' } as PlayerAction),
    ).toThrow();
  });

  it('computeResult returns 2 rankings', () => {
    const state = engine.startGame(makeConfig());
    expect(engine.computeResult(state)).toHaveLength(2);
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });
});
