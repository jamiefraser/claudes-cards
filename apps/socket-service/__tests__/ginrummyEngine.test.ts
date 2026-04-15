/**
 * Gin Rummy Engine Tests
 */

import { GinRummyEngine } from '../src/games/ginrummy/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'ginrummy',
    playerIds: ['p1', 'p2'],
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('GinRummyEngine', () => {
  let engine: GinRummyEngine;

  beforeEach(() => { engine = new GinRummyEngine(); });

  it('has gameId = ginrummy', () => {
    expect(engine.gameId).toBe('ginrummy');
  });

  it('requires exactly 2 players', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(2);
  });

  it('deals 10 cards to each player', () => {
    const state = engine.startGame(makeConfig());
    state.players.forEach(p => expect(p.hand).toHaveLength(10));
  });

  it('starts in playing phase', () => {
    const state = engine.startGame(makeConfig());
    expect(state.phase).toBe('playing');
  });

  it('allows draw on first turn', () => {
    const state = engine.startGame(makeConfig());
    const actions = engine.getValidActions(state, state.currentTurn!);
    expect(actions.some(a => a.type === 'draw')).toBe(true);
  });

  it('draw adds a card to hand', () => {
    const state = engine.startGame(makeConfig());
    const playerId = state.currentTurn!;
    const before = state.players.find(p => p.playerId === playerId)!.hand.length;
    const after = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    expect(after.players.find(p => p.playerId === playerId)!.hand.length).toBe(before + 1);
  });

  it('discard removes card from hand', () => {
    let state = engine.startGame(makeConfig());
    const playerId = state.currentTurn!;
    state = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const card = state.players.find(p => p.playerId === playerId)!.hand[0]!;
    const after = engine.applyAction(state, playerId, { type: 'discard', cardIds: [card.id] });
    expect(after.players.find(p => p.playerId === playerId)!.hand.some(c => c.id === card.id)).toBe(false);
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });

  it('computeResult returns 2 rankings', () => {
    const result = engine.computeResult(engine.startGame(makeConfig()));
    expect(result).toHaveLength(2);
  });

  it('rejects action from wrong player', () => {
    const state = engine.startGame(makeConfig());
    const other = state.players.find(p => p.playerId !== state.currentTurn)!;
    expect(() => engine.applyAction(state, other.playerId, { type: 'draw', payload: { source: 'deck' } })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Hoyle's Gin Rummy \u2014 deadwood, knock, gin, undercut (added April 2026).
// ---------------------------------------------------------------------------
import { computeDeadwood, applyLayoffs } from '../src/games/ginrummy/engine';
import type { Card, GameState } from '@card-platform/shared-types';

function gc(id: string, rank: string, suit: 'hearts'|'diamonds'|'clubs'|'spades'): Card {
  const vm: Record<string, number> = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:10,Q:10,K:10 };
  return { id, deckType: 'standard', rank: rank as Card['rank'], suit, value: vm[rank]!, faceUp: false };
}

describe("GinRummyEngine \u2014 Hoyle's rule suite", () => {
  it('computeDeadwood recognises 3-of-a-kind sets', () => {
    const hand = [
      gc('a','7','hearts'), gc('b','7','spades'), gc('c','7','clubs'),
      gc('d','2','hearts'), gc('e','9','diamonds'),
      gc('f','K','clubs'), gc('g','J','hearts'),
      gc('h','5','spades'), gc('i','3','diamonds'), gc('j','4','clubs'),
    ];
    // Melded: 3 sevens. Remaining 2+9+10+10+5+3+4 = 43.
    // (3-4-5 is NOT a run because suits differ.)
    expect(computeDeadwood(hand)).toBe(43);
  });

  it('computeDeadwood recognises 3-card suited runs', () => {
    const hand = [
      gc('a','5','hearts'), gc('b','6','hearts'), gc('c','7','hearts'),
      gc('d','2','spades'), gc('e','9','diamonds'),
      gc('f','K','clubs'), gc('g','J','hearts'),
      gc('h','4','spades'), gc('i','3','diamonds'), gc('j','A','clubs'),
    ];
    // Melded: 5-6-7\u2665 (18). Remaining 2+9+10+10+4+3+1 = 39.
    expect(computeDeadwood(hand)).toBe(39);
  });

  it('computeDeadwood = 0 for a gin hand', () => {
    const hand = [
      gc('a','5','hearts'), gc('b','5','spades'), gc('c','5','clubs'), gc('d','5','diamonds'),
      gc('e','9','spades'), gc('f','10','spades'), gc('g','J','spades'),
      gc('h','K','hearts'), gc('i','K','clubs'), gc('j','K','diamonds'),
    ];
    expect(computeDeadwood(hand)).toBe(0);
  });

  it('Ace is low \u2014 Q-K-A is NOT a valid run', () => {
    const hand = [
      gc('a','Q','hearts'), gc('b','K','hearts'), gc('c','A','hearts'),
      gc('d','3','spades'), gc('e','4','spades'), gc('f','5','spades'),
      gc('g','2','clubs'), gc('h','6','clubs'), gc('i','7','clubs'), gc('j','8','clubs'),
    ];
    // Valid melds: 3-4-5\u2660 (12) and 6-7-8\u2663 (21). Deadwood: Q,K,A\u2665 = 21 plus 2\u2663 = 2.
    // Total deadwood = 21 + 2 = 23.
    expect(computeDeadwood(hand)).toBe(23);
  });

  it('undercut: defender with lower deadwood scores the difference + 25', () => {
    const engine = new GinRummyEngine();
    const start = engine.startGame({
      roomId: 'gr-undercut',
      gameId: 'ginrummy',
      playerIds: ['p1','p2'],
      asyncMode: true,
      turnTimerSeconds: 90,
    });

    // Knocker (p1): 3-set + 3-set + 3-run + 10\u2665 loose \u2192 deadwood 10.
    const p1Hand = [
      gc('p1-a','5','hearts'), gc('p1-b','5','spades'), gc('p1-c','5','clubs'),
      gc('p1-d','K','hearts'), gc('p1-e','K','spades'), gc('p1-f','K','clubs'),
      gc('p1-g','2','diamonds'), gc('p1-h','3','diamonds'), gc('p1-i','4','diamonds'),
      gc('p1-j','10','hearts'),
    ];
    // Defender (p2): 4-set + 3-set + 3-run \u2192 gin (deadwood 0).
    const p2Hand = [
      gc('p2-a','8','hearts'), gc('p2-b','8','spades'), gc('p2-c','8','clubs'), gc('p2-d','8','diamonds'),
      gc('p2-e','Q','hearts'), gc('p2-f','Q','spades'), gc('p2-g','Q','clubs'),
      gc('p2-h','3','hearts'), gc('p2-i','4','hearts'), gc('p2-j','5','hearts'),
    ];

    const state: GameState = {
      ...start,
      currentTurn: 'p1',
      players: start.players.map((p) =>
        p.playerId === 'p1' ? { ...p, hand: p1Hand } : { ...p, hand: p2Hand },
      ),
      publicData: { ...start.publicData, turnPhase: 'discard' },
    };

    // Knock now opens a showdown — both hands are revealed and scoring
    // waits for every human to ack. We ack as both p1 and p2 to settle.
    const knocked = engine.applyAction(state, 'p1', { type: 'knock' });
    const sd = (knocked.publicData as Record<string, unknown>)['showdown'] as
      | { active: boolean; isUndercut: boolean; players: Array<{ melds: unknown[][]; deadwoodPts: number }> }
      | undefined;
    expect(sd?.active).toBe(true);
    expect(sd?.isUndercut).toBe(true);
    // Both players' melds are visible.
    expect(sd?.players[0].melds.length).toBeGreaterThan(0);
    expect(sd?.players[1].melds.length).toBeGreaterThan(0);
    // Scores haven't moved yet — settlement is gated on acks.
    const beforeAck = knocked.players.find((p) => p.playerId === 'p2')!;
    expect(beforeAck.score).toBe(0);

    const ackedOnce = engine.applyAction(knocked, 'p1', { type: 'ack-show' });
    const afterFirst = ackedOnce.players.find((p) => p.playerId === 'p2')!;
    expect(afterFirst.score).toBe(0);

    const final = engine.applyAction(ackedOnce, 'p2', { type: 'ack-show' });
    const p1 = final.players.find((p) => p.playerId === 'p1')!;
    const p2 = final.players.find((p) => p.playerId === 'p2')!;
    // Undercut: defender scores (10 - 0) + 25 = 35. Knocker 0.
    expect(p1.score).toBe(0);
    expect(p2.score).toBe(35);
  });

  it('bots auto-ack the showdown so a human alone can settle the round', () => {
    const engine = new GinRummyEngine();
    const start = engine.startGame({
      roomId: 'gr-bot-ack',
      gameId: 'ginrummy',
      playerIds: ['human','bot1'],
      asyncMode: true,
      turnTimerSeconds: 90,
    });
    // Knocker (human): 3-set + 3-set + 3-run + low loose card → deadwood ≤ 10.
    const humanHand = [
      gc('h-a','5','hearts'), gc('h-b','5','spades'), gc('h-c','5','clubs'),
      gc('h-d','K','hearts'), gc('h-e','K','spades'), gc('h-f','K','clubs'),
      gc('h-g','2','diamonds'), gc('h-h','3','diamonds'), gc('h-i','4','diamonds'),
      gc('h-j','7','hearts'),
    ];
    const botHand = [
      gc('b-a','8','hearts'), gc('b-b','8','spades'), gc('b-c','8','clubs'), gc('b-d','8','diamonds'),
      gc('b-e','Q','hearts'), gc('b-f','Q','spades'), gc('b-g','Q','clubs'),
      gc('b-h','3','hearts'), gc('b-i','4','hearts'), gc('b-j','5','hearts'),
    ];

    const state: GameState = {
      ...start,
      currentTurn: 'human',
      players: start.players.map((p) =>
        p.playerId === 'human'
          ? { ...p, hand: humanHand, isBot: false }
          : { ...p, hand: botHand, isBot: true },
      ),
      publicData: { ...start.publicData, turnPhase: 'discard' },
    };

    const knocked = engine.applyAction(state, 'human', { type: 'knock' });
    expect(((knocked.publicData as Record<string, unknown>)['showdown'] as { active: boolean }).active).toBe(true);

    // Single human ack settles the round — bot is auto-acked.
    const settled = engine.applyAction(knocked, 'human', { type: 'ack-show' });
    const settledSd = (settled.publicData as Record<string, unknown>)['showdown'] as
      | { active: boolean; acked: string[] };
    expect(settledSd.active).toBe(false);
    expect(settledSd.acked).toEqual(expect.arrayContaining(['human','bot1']));
    // Bot has gin (deadwood 0), human knocked with deadwood 7 → undercut.
    // The point of this test is that the round SETTLED after a single
    // human ack (bot was auto-acked), so check the bot received undercut points.
    const bot = settled.players.find((p) => p.playerId === 'bot1')!;
    expect(bot.score).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Lay-offs (Hoyle's): defender drops deadwood onto knocker's melds.
  // -------------------------------------------------------------------------
  describe('applyLayoffs', () => {
    it('adds a 4th-of-rank to a 3-card set', () => {
      const knockerMelds = [[
        gc('k1','7','hearts'), gc('k2','7','spades'), gc('k3','7','clubs'),
      ]];
      const dead = [gc('d1','7','diamonds'), gc('d2','K','spades')];
      const r = applyLayoffs(dead, knockerMelds);
      expect(r.laidOff).toHaveLength(1);
      expect(r.laidOff[0]!.id).toBe('d1');
      expect(r.remaining.map(c => c.id)).toEqual(['d2']);
      expect(r.deadwoodPts).toBe(10);
    });

    it('does NOT add a 5th card to an already-4 set', () => {
      const knockerMelds = [[
        gc('k1','7','hearts'), gc('k2','7','spades'),
        gc('k3','7','clubs'),  gc('k4','7','diamonds'),
      ]];
      const dead = [gc('d1','7','hearts')];
      const r = applyLayoffs(dead, knockerMelds);
      expect(r.laidOff).toHaveLength(0);
      expect(r.remaining).toHaveLength(1);
    });

    it('extends a run at either end (greedily, both directions)', () => {
      const knockerMelds = [[
        gc('k1','5','spades'), gc('k2','6','spades'), gc('k3','7','spades'),
      ]];
      const dead = [
        gc('d1','4','spades'),  // extends low
        gc('d2','8','spades'),  // extends high
        gc('d3','9','spades'),  // chains off d2
        gc('d4','3','spades'),  // chains off d1
        gc('d5','J','hearts'),  // unrelated
      ];
      const r = applyLayoffs(dead, knockerMelds);
      expect(r.laidOff.map(c => c.id).sort()).toEqual(['d1','d2','d3','d4']);
      expect(r.remaining.map(c => c.id)).toEqual(['d5']);
      expect(r.deadwoodPts).toBe(10);
    });

    it('does not wrap A-K (Ace is low only)', () => {
      const knockerMelds = [[
        gc('k1','J','spades'), gc('k2','Q','spades'), gc('k3','K','spades'),
      ]];
      const dead = [gc('d1','A','spades')];
      const r = applyLayoffs(dead, knockerMelds);
      expect(r.laidOff).toHaveLength(0);
      expect(r.remaining).toHaveLength(1);
    });

    it('a lay-off does not require any cards to be moved off knocker melds', () => {
      const knockerMelds = [
        [gc('k1','5','spades'), gc('k2','6','spades'), gc('k3','7','spades')],
        [gc('k4','9','hearts'), gc('k5','9','spades'), gc('k6','9','clubs')],
      ];
      const dead = [gc('d1','9','diamonds'), gc('d2','8','spades')];
      const r = applyLayoffs(dead, knockerMelds);
      expect(r.laidOff.map(c => c.id).sort()).toEqual(['d1','d2']);
      expect(r.remaining).toHaveLength(0);
      expect(r.deadwoodPts).toBe(0);
    });
  });

  it('lay-offs reduce defender deadwood and shift undercut into a knocker win', () => {
    const engine = new GinRummyEngine();
    const start = engine.startGame({
      roomId: 'gr-layoff',
      gameId: 'ginrummy',
      playerIds: ['p1','p2'],
      asyncMode: true,
      turnTimerSeconds: 90,
    });
    // Knocker (p1) melds: 5♥5♠5♣ (set), K♥K♠K♣ (set), 2♦3♦4♦ (run). One loose 6♥ = 6 deadwood.
    const p1Hand = [
      gc('p1-a','5','hearts'), gc('p1-b','5','spades'), gc('p1-c','5','clubs'),
      gc('p1-d','K','hearts'), gc('p1-e','K','spades'), gc('p1-f','K','clubs'),
      gc('p1-g','2','diamonds'), gc('p1-h','3','diamonds'), gc('p1-i','4','diamonds'),
      gc('p1-j','6','hearts'),
    ];
    // Defender (p2) melds: 8♥8♠8♣ (set), J♥J♠J♣ (set). Deadwood:
    //   A♦  → extends knocker's 2-3-4♦ run on the low side (Ace is low).
    //   K♦  → joins knocker's K-set (3→4 cards).
    //   7♥  → no home (7 deadwood).
    //   9♣  → no home (9 deadwood).
    // Pre-layoff deadwood = 1+10+7+9 = 27. After layoffs = 7+9 = 16.
    // Knocker deadwood = 6, defender = 16 → knocker wins by 10.
    const p2Hand = [
      gc('p2-a','8','hearts'), gc('p2-b','8','spades'), gc('p2-c','8','clubs'),
      gc('p2-d','J','hearts'), gc('p2-e','J','spades'), gc('p2-f','J','clubs'),
      gc('p2-g','A','diamonds'), gc('p2-h','K','diamonds'),
      gc('p2-i','7','hearts'),  gc('p2-j','9','clubs'),
    ];

    const state: GameState = {
      ...start,
      currentTurn: 'p1',
      players: start.players.map((p) =>
        p.playerId === 'p1' ? { ...p, hand: p1Hand } : { ...p, hand: p2Hand },
      ),
      publicData: { ...start.publicData, turnPhase: 'discard' },
    };

    const knocked = engine.applyAction(state, 'p1', { type: 'knock' });
    const sd = (knocked.publicData as Record<string, unknown>)['showdown'] as
      | { players: Array<{ playerId: string; deadwoodPts: number; laidOff: unknown[] }>; knockerPts: number; oppPts: number; isUndercut: boolean };
    const def = sd.players.find(p => p.playerId === 'p2')!;
    expect(def.laidOff).toHaveLength(2);
    expect(def.deadwoodPts).toBe(16);
    expect(sd.isUndercut).toBe(false);
    expect(sd.knockerPts).toBe(10);

    const after1 = engine.applyAction(knocked, 'p1', { type: 'ack-show' });
    const after2 = engine.applyAction(after1,  'p2', { type: 'ack-show' });
    const p1 = after2.players.find((p) => p.playerId === 'p1')!;
    expect(p1.score).toBe(10);
  });

  it('Gin disables lay-offs', () => {
    const engine = new GinRummyEngine();
    const start = engine.startGame({
      roomId: 'gr-gin-no-layoff',
      gameId: 'ginrummy',
      playerIds: ['p1','p2'],
      asyncMode: true,
      turnTimerSeconds: 90,
    });
    // p1 goes gin (deadwood 0).
    const p1Hand = [
      gc('p1-a','8','hearts'), gc('p1-b','8','spades'), gc('p1-c','8','clubs'), gc('p1-d','8','diamonds'),
      gc('p1-e','Q','hearts'), gc('p1-f','Q','spades'), gc('p1-g','Q','clubs'),
      gc('p1-h','3','hearts'), gc('p1-i','4','hearts'), gc('p1-j','5','hearts'),
    ];
    // p2 has cards that would lay off if allowed — they should NOT.
    const p2Hand = [
      gc('p2-a','5','spades'), gc('p2-b','5','clubs'), gc('p2-c','5','diamonds'),
      gc('p2-d','K','hearts'), gc('p2-e','K','spades'), gc('p2-f','K','clubs'),
      gc('p2-g','8','clubs'),  // would lay off on the 8-set
      gc('p2-h','Q','diamonds'),  // would lay off on the Q-set
      gc('p2-i','2','hearts'), gc('p2-j','6','hearts'),  // would extend the heart run
    ];
    const state: GameState = {
      ...start,
      currentTurn: 'p1',
      players: start.players.map((p) =>
        p.playerId === 'p1' ? { ...p, hand: p1Hand } : { ...p, hand: p2Hand },
      ),
      publicData: { ...start.publicData, turnPhase: 'discard' },
    };
    const knocked = engine.applyAction(state, 'p1', { type: 'knock' });
    const sd = (knocked.publicData as Record<string, unknown>)['showdown'] as
      | { isGin: boolean; players: Array<{ playerId: string; laidOff: unknown[] }> };
    expect(sd.isGin).toBe(true);
    const def = sd.players.find(p => p.playerId === 'p2')!;
    expect(def.laidOff).toHaveLength(0);
  });
});
