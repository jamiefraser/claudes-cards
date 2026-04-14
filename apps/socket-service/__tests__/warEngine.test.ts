/**
 * War Engine Tests
 */

import { WarEngine } from '../src/games/war/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'war',
    playerIds: ['p1', 'p2'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('WarEngine', () => {
  let engine: WarEngine;

  beforeEach(() => { engine = new WarEngine(); });

  it('has gameId = war', () => {
    expect(engine.gameId).toBe('war');
  });

  it('requires exactly 2 players', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(2);
  });

  it('splits 52 cards evenly: 26 each', () => {
    const state = engine.startGame(makeConfig());
    state.players.forEach(p => expect(p.hand).toHaveLength(26));
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig()).phase).toBe('playing');
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });

  it('computeResult returns 2 rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig()))).toHaveLength(2);
  });

  it('applyAction flip plays top card', () => {
    const state = engine.startGame(makeConfig());
    const after = engine.applyAction(state, state.currentTurn!, { type: 'flip' });
    expect(after.version).toBe(state.version + 1);
  });

  // -------------------------------------------------------------------------
  // Hoyle's War \u2014 rule checks (added April 2026).
  // -------------------------------------------------------------------------

  it("splits the 52-card deck evenly to each player (Hoyle's)", () => {
    const state = engine.startGame(makeConfig());
    const [p1, p2] = state.players;
    expect(p1!.hand.length).toBe(26);
    expect(p2!.hand.length).toBe(26);
  });

  it('higher card takes both cards into the winner\u2019s hand', () => {
    // Force a deterministic outcome by pinning the top cards.
    const start = engine.startGame(makeConfig());
    const p1 = start.players[0]!;
    const p2 = start.players[1]!;
    const high = { ...p1.hand[0]!, rank: 'A' as const, value: 14, faceUp: false };
    const low = { ...p2.hand[0]!, rank: '2' as const, value: 2, faceUp: false };
    const state = {
      ...start,
      players: [
        { ...p1, hand: [high, ...p1.hand.slice(1)] },
        { ...p2, hand: [low, ...p2.hand.slice(1)] },
      ],
    };
    const after = engine.applyAction(state, state.currentTurn!, { type: 'flip' });
    const np1 = after.players[0]!;
    const np2 = after.players[1]!;
    // Winner gives up 1 card and takes both, net +1; loser just loses 1.
    expect(np1.hand.length).toBe(27);
    expect(np2.hand.length).toBe(25);
  });

  it('a tie triggers war: both put 3 face-down cards onto the pile', () => {
    const start = engine.startGame(makeConfig());
    const p1 = start.players[0]!;
    const p2 = start.players[1]!;
    const tieCard1 = { ...p1.hand[0]!, rank: '7' as const, value: 7, faceUp: false };
    const tieCard2 = { ...p2.hand[0]!, rank: '7' as const, value: 7, faceUp: false };
    const state = {
      ...start,
      players: [
        { ...p1, hand: [tieCard1, ...p1.hand.slice(1)] },
        { ...p2, hand: [tieCard2, ...p2.hand.slice(1)] },
      ],
    };
    const after = engine.applyAction(state, state.currentTurn!, { type: 'flip' });
    const pd = after.publicData as Record<string, unknown>;
    expect(pd['atWar']).toBe(true);
    // War pile: 1 flipped + 3 face-down = 4 per side = 8 total.
    expect((pd['warPile'] as unknown[]).length).toBe(8);
    // Each player lost 1 flipped + 3 war cards = 4 from the front.
    expect(after.players[0]!.hand.length).toBe(22);
    expect(after.players[1]!.hand.length).toBe(22);
  });
});
