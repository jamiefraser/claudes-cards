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
import { computeDeadwood } from '../src/games/ginrummy/engine';
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

    const after = engine.applyAction(state, 'p1', { type: 'knock' });
    const p1 = after.players.find((p) => p.playerId === 'p1')!;
    const p2 = after.players.find((p) => p.playerId === 'p2')!;
    // Undercut: defender scores (10 - 0) + 25 = 35. Knocker 0.
    expect(p1.score).toBe(0);
    expect(p2.score).toBe(35);
  });
});
