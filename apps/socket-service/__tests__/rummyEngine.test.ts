/**
 * Rummy Engine Tests — test-first per CLAUDE.md rule 6
 */

import { RummyEngine } from '../src/games/rummy/engine';
import type { GameConfig, GameState } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'rummy',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('RummyEngine', () => {
  let engine: RummyEngine;

  beforeEach(() => { engine = new RummyEngine(); });

  it('has gameId = rummy', () => {
    expect(engine.gameId).toBe('rummy');
  });

  it('deals 10 cards each for 2-player game', () => {
    const state = engine.startGame(makeConfig(2));
    state.players.forEach(p => expect(p.hand).toHaveLength(10));
  });

  it('deals 7 cards each for 3-player game', () => {
    const state = engine.startGame(makeConfig(3));
    state.players.forEach(p => expect(p.hand).toHaveLength(7));
  });

  it('deals 6 cards each for 5-player game', () => {
    const state = engine.startGame(makeConfig(5));
    state.players.forEach(p => expect(p.hand).toHaveLength(6));
  });

  it('starts with phase playing', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.phase).toBe('playing');
  });

  it('has a discard top card after deal', () => {
    const state = engine.startGame(makeConfig(2));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd.discardTop).toBeTruthy();
  });

  it('allows draw from deck on first turn', () => {
    const state = engine.startGame(makeConfig(2));
    const actions = engine.getValidActions(state, state.currentTurn!);
    expect(actions.some(a => a.type === 'draw')).toBe(true);
  });

  it('applyAction draw adds card to hand', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const before = state.players.find(p => p.playerId === playerId)!.hand.length;
    const after = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    expect(after.players.find(p => p.playerId === playerId)!.hand.length).toBe(before + 1);
  });

  it('applyAction discard removes card from hand', () => {
    let state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    state = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const card = state.players.find(p => p.playerId === playerId)!.hand[0]!;
    const after = engine.applyAction(state, playerId, { type: 'discard', cardIds: [card.id] });
    expect(after.players.find(p => p.playerId === playerId)!.hand.some(c => c.id === card.id)).toBe(false);
  });

  it('rejects action when not player turn', () => {
    const state = engine.startGame(makeConfig(2));
    const otherPlayer = state.players.find(p => p.playerId !== state.currentTurn)!;
    expect(() => engine.applyAction(state, otherPlayer.playerId, { type: 'draw', payload: { source: 'deck' } })).toThrow();
  });

  it('isGameOver returns false at start', () => {
    const state = engine.startGame(makeConfig(2));
    expect(engine.isGameOver(state)).toBe(false);
  });

  it('computeResult returns one ranking per player', () => {
    const state = engine.startGame(makeConfig(2));
    const result = engine.computeResult(state);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.rank >= 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hoyle's Rummy \u2014 meld validation (added April 2026).
// ---------------------------------------------------------------------------

import { isValidMeld } from '../src/games/rummy/engine';
import type { Card } from '@card-platform/shared-types';

function rc(id: string, rank: string, suit: 'hearts'|'diamonds'|'clubs'|'spades'): Card {
  const vm: Record<string, number> = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
  return { id, deckType: 'standard', rank: rank as Card['rank'], suit, value: vm[rank]!, faceUp: false };
}

describe("RummyEngine \u2014 Hoyle's meld rules", () => {
  const engine = new RummyEngine();

  it('3 of a kind is a valid set', () => {
    expect(isValidMeld([rc('a','7','hearts'), rc('b','7','spades'), rc('c','7','clubs')])).toBe(true);
  });

  it('4 of a kind is a valid set', () => {
    expect(isValidMeld([rc('a','J','hearts'), rc('b','J','spades'), rc('c','J','clubs'), rc('d','J','diamonds')])).toBe(true);
  });

  it('3 consecutive in one suit is a valid run', () => {
    expect(isValidMeld([rc('a','4','hearts'), rc('b','5','hearts'), rc('c','6','hearts')])).toBe(true);
  });

  it('mixed-suit "run" is invalid', () => {
    expect(isValidMeld([rc('a','4','hearts'), rc('b','5','spades'), rc('c','6','hearts')])).toBe(false);
  });

  it('Q-K-A is NOT a valid run (Ace is low in Rummy)', () => {
    expect(isValidMeld([rc('a','Q','hearts'), rc('b','K','hearts'), rc('c','A','hearts')])).toBe(false);
  });

  it('2 cards cannot form a meld', () => {
    expect(isValidMeld([rc('a','7','hearts'), rc('b','7','spades')])).toBe(false);
  });

  it("deal sizes: 10 (2p), 7 (3\u20134p), 6 (5\u20136p)", () => {
    expect(engine.startGame(makeConfig(2)).players[0]!.hand.length).toBe(10);
    expect(engine.startGame(makeConfig(4)).players[0]!.hand.length).toBe(7);
    expect(engine.startGame(makeConfig(6)).players[0]!.hand.length).toBe(6);
  });
});

