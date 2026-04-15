import { describe, it, expect } from 'vitest';
import { computeDeadwood } from './ginrummyDeadwood';
import type { Card, Rank, Suit } from '@shared/cards';

const SUITS: Record<'S' | 'H' | 'D' | 'C', Suit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};

const c = (rank: Rank, suit: 'S' | 'H' | 'D' | 'C', id?: string): Card => ({
  id: id ?? `${rank}${suit}`,
  rank,
  suit: SUITS[suit],
  deckType: 'standard',
  value: 0,
  faceUp: true,
});

describe('computeDeadwood (ginrummy, port of engine.ts)', () => {
  it('returns 0 for an empty hand', () => {
    expect(computeDeadwood([])).toBe(0);
  });

  it('returns total points when no melds exist', () => {
    const hand = [c('A', 'S'), c('5', 'H'), c('K', 'D')];
    expect(computeDeadwood(hand)).toBe(1 + 5 + 10);
  });

  it('recognises a 3-card set', () => {
    const hand = [c('7', 'S'), c('7', 'H'), c('7', 'D'), c('K', 'C')];
    expect(computeDeadwood(hand)).toBe(10);
  });

  it('recognises a 4-card set', () => {
    const hand = [c('5', 'S'), c('5', 'H'), c('5', 'D'), c('5', 'C'), c('Q', 'S')];
    expect(computeDeadwood(hand)).toBe(10);
  });

  it('recognises a 3-card run in one suit', () => {
    const hand = [c('4', 'S'), c('5', 'S'), c('6', 'S'), c('K', 'H')];
    expect(computeDeadwood(hand)).toBe(10);
  });

  it('treats Ace as low; A-K is not a run', () => {
    const hand = [c('A', 'S'), c('K', 'S'), c('Q', 'S')];
    expect(computeDeadwood(hand)).toBe(1 + 10 + 10);
  });

  it('finds gin (deadwood = 0) when 10 cards split into a set + a run', () => {
    const hand = [
      c('7', 'S'), c('7', 'H'), c('7', 'D'),
      c('4', 'C'), c('5', 'C'), c('6', 'C'), c('7', 'C'),
      c('J', 'S'), c('Q', 'S'), c('K', 'S'),
    ];
    expect(computeDeadwood(hand)).toBe(0);
  });

  it('does not double-use a card across overlapping melds', () => {
    // Hand admits both a 7-set (7S 7H 7D) and a spade run (4S 5S 6S) — the
    // 7S is NOT shared. Deadwood should drop to the lone Ace.
    const hand = [
      c('7', 'S'), c('7', 'H'), c('7', 'D'),
      c('4', 'S'), c('5', 'S'), c('6', 'S'),
      c('A', 'C'),
    ];
    expect(computeDeadwood(hand)).toBe(1);
  });

  it('cannot share a card between a set and an overlapping run', () => {
    // The 7S could complete either a 7-set OR a spade run, not both.
    // Best is the 7-set (21 pts melded), leaving 5S, 6S, AC = 12 deadwood.
    const hand = [
      c('7', 'S'), c('7', 'H'), c('7', 'D'),
      c('5', 'S'), c('6', 'S'),
      c('A', 'C'),
    ];
    expect(computeDeadwood(hand)).toBe(12);
  });
});
