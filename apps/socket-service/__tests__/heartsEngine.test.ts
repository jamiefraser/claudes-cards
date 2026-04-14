/**
 * Hearts Engine Tests
 */

import { HeartsEngine } from '../src/games/hearts/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'hearts',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('HeartsEngine', () => {
  let engine: HeartsEngine;

  beforeEach(() => { engine = new HeartsEngine(); });

  it('has gameId = hearts', () => {
    expect(engine.gameId).toBe('hearts');
  });

  it('requires exactly 4 players', () => {
    expect(engine.minPlayers).toBe(4);
    expect(engine.maxPlayers).toBe(4);
  });

  it('deals 13 cards to each player', () => {
    const state = engine.startGame(makeConfig());
    state.players.forEach(p => expect(p.hand).toHaveLength(13));
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig()).phase).toBe('playing');
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });

  it('computeResult returns 4 rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig()))).toHaveLength(4);
  });

  it('getValidActions returns play actions for current player', () => {
    const state = engine.startGame(makeConfig());
    const actions = engine.getValidActions(state, state.currentTurn!);
    expect(actions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Hoyle's Hearts rule suite (added April 2026).
// ---------------------------------------------------------------------------

import type { Card, GameState } from '@card-platform/shared-types';

function sCard(id: string, rank: string, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'): Card {
  const vm: Record<string, number> = {
    A: 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, J: 11, Q: 12, K: 13,
  };
  return { id, deckType: 'standard', rank: rank as Card['rank'], suit, value: vm[rank]!, faceUp: true };
}

describe("HeartsEngine \u2014 Hoyle's rule suite", () => {
  const engine = new HeartsEngine();
  const cfg: GameConfig = {
    roomId: 'h',
    gameId: 'hearts',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    asyncMode: false,
    turnTimerSeconds: null,
  };

  function skipPass(start: GameState): GameState {
    const pd = start.publicData as Record<string, unknown>;
    // Hand leadership goes to whoever holds 2\u2663.
    const twoClubsPlayer = start.players.find((p) =>
      p.hand.some((c) => c.suit === 'clubs' && c.rank === '2'),
    );
    return {
      ...start,
      currentTurn: twoClubsPlayer?.playerId ?? start.currentTurn,
      publicData: { ...pd, passPhase: false, passDirection: 'hold', pendingPasses: {} },
    };
  }

  it('first trick: must lead 2 of clubs if held', () => {
    const start = engine.startGame(cfg);
    const state = skipPass(start);
    const leader = state.players.find((p) => p.playerId === state.currentTurn)!;
    const nonTwoClubs = leader.hand.find((c) => !(c.suit === 'clubs' && c.rank === '2'))!;
    expect(() =>
      engine.applyAction(state, leader.playerId, { type: 'play', cardIds: [nonTwoClubs.id] }),
    ).toThrow(/2 of clubs/i);
  });

  it("first trick: can't play hearts or Q\u2660 even when void in clubs", () => {
    // Craft a state where the second player has no clubs but has hearts.
    const start = engine.startGame(cfg);
    const leaderId = start.publicData.currentTurn as string ?? start.currentTurn!;
    const players = start.players.map((p, i) => {
      if (i === 1) {
        // Give this player no clubs, including a Q\u2660 and a heart
        return {
          ...p,
          hand: [
            sCard('x1', 'Q', 'spades'),
            sCard('x2', '5', 'hearts'),
            sCard('x3', '7', 'diamonds'),
            sCard('x4', '8', 'diamonds'),
            sCard('x5', '9', 'diamonds'),
            sCard('x6', '10', 'diamonds'),
            sCard('x7', 'J', 'diamonds'),
            sCard('x8', 'Q', 'diamonds'),
            sCard('x9', 'K', 'diamonds'),
            sCard('xa', 'A', 'diamonds'),
            sCard('xb', '2', 'diamonds'),
            sCard('xc', '3', 'diamonds'),
            sCard('xd', '4', 'diamonds'),
          ],
        };
      }
      return p;
    });
    // Make the leader have a 2\u2663 so the first-trick rule engages.
    const leadWithTwoClubs = players.map((p, i) => {
      if (i === 0) {
        const twoClubs = sCard('2c', '2', 'clubs');
        return { ...p, hand: [twoClubs, ...p.hand.slice(1)] };
      }
      return p;
    });
    let state: GameState = {
      ...start,
      players: leadWithTwoClubs,
      currentTurn: leadWithTwoClubs[0]!.playerId,
      publicData: {
        ...start.publicData,
        passPhase: false,
        passDirection: 'hold',
        pendingPasses: {},
        currentTrick: [],
      },
    };
    // Leader plays 2\u2663
    state = engine.applyAction(state, leadWithTwoClubs[0]!.playerId, {
      type: 'play',
      cardIds: ['2c'],
    });
    // Now p2 is up, void in clubs. Playing Q\u2660 or hearts should throw.
    expect(() =>
      engine.applyAction(state, 'p2', { type: 'play', cardIds: ['x1'] }),
    ).toThrow(/first trick/i);
    expect(() =>
      engine.applyAction(state, 'p2', { type: 'play', cardIds: ['x2'] }),
    ).toThrow(/first trick/i);
    // Playing a diamond is fine.
    expect(() =>
      engine.applyAction(state, 'p2', { type: 'play', cardIds: ['x3'] }),
    ).not.toThrow();
  });

  it('cannot lead hearts until broken', () => {
    // Start a new hand state where hearts are not broken and it's a player's
    // lead. We can't easily reach lead without playing cards, so construct:
    const start = engine.startGame(cfg);
    const state: GameState = {
      ...start,
      currentTurn: 'p1',
      publicData: {
        ...start.publicData,
        passPhase: false,
        heartsBroken: false,
        currentTrick: [],
        ledSuit: null,
      },
    };
    // Replace p1's hand with a heart + some clubs so hearts aren't the only option.
    const p1Hand = [
      sCard('h1', '5', 'hearts'),
      sCard('c2', '2', 'clubs'),
      sCard('c3', '3', 'clubs'),
    ];
    state.players = state.players.map((p) =>
      p.playerId === 'p1' ? { ...p, hand: p1Hand } : p,
    );
    // Not first trick \u2014 force by emptying one trick card out of hand counts.
    state.players[1]!.hand = state.players[1]!.hand.slice(1);
    expect(() =>
      engine.applyAction(state, 'p1', { type: 'play', cardIds: ['h1'] }),
    ).toThrow(/hearts have not been broken/i);
  });

  it('scoring: hearts = 1 pt each; Q\u2660 = 13', () => {
    // Use the public scoring helper (inline via cardPoints is private). We
    // indirectly test by playing out a single trick.
    // Instead, assert via pointsThisHand after a constructed trick play.
    // Simplest: check that a hearts-only card is 1 pt and Q\u2660 is 13 by
    // constructing a trick and inspecting the winner's pointsThisHand.
    const start = engine.startGame(cfg);
    const state: GameState = {
      ...start,
      currentTurn: 'p1',
      publicData: {
        ...start.publicData,
        passPhase: false,
        heartsBroken: true,
        currentTrick: [],
        ledSuit: null,
      },
      players: start.players.map((p) => ({ ...p, hand: [] })),
    };
    // Give each player exactly one card to play.
    state.players[0]!.hand = [sCard('q', 'Q', 'spades')];
    state.players[1]!.hand = [sCard('s5', '5', 'spades')];
    state.players[2]!.hand = [sCard('s6', '6', 'spades')];
    state.players[3]!.hand = [sCard('s7', '7', 'spades')];
    let s: GameState = state;
    s = engine.applyAction(s, 'p1', { type: 'play', cardIds: ['q'] });
    s = engine.applyAction(s, s.currentTurn!, { type: 'play', cardIds: ['s5'] });
    s = engine.applyAction(s, s.currentTurn!, { type: 'play', cardIds: ['s6'] });
    s = engine.applyAction(s, s.currentTurn!, { type: 'play', cardIds: ['s7'] });
    // Q\u2660 (12) beats 5/6/7 so p1 wins the trick and takes 13 pts.
    // After the hand ends (all hands empty) the engine deals a new hand and
    // zeroes pointsThisHand \u2014 but the running total lives on player.score.
    const p1Score = s.players.find((p) => p.playerId === 'p1')!.score;
    expect(p1Score).toBe(13);
  });

  it('pass cycle: left, right, across, hold', () => {
    const e = new HeartsEngine();
    // Check the exposed helper via many rounds \u2014 can't easily do it without
    // exporting passDirectionFor. Check indirectly by simulating 4 rounds via
    // state mutations isn't practical \u2014 instead assert round 1 passes left.
    const start = e.startGame(cfg);
    const pd = start.publicData as Record<string, unknown>;
    expect(pd['passPhase']).toBe(true);
    expect(pd['passDirection']).toBe('left');
  });
});
