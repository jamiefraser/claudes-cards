/**
 * Client-side Phase 10 hit-meld rules — parity with the engine.
 */
import { describe, it, expect } from 'vitest';
import { canPhase10HitMeld } from '../src/utils/phase10HitRules';
import type { Card } from '@shared/cards';

function num(id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red'): Card {
  return { id, deckType: 'phase10', phase10Type: 'number', phase10Color: color, value, faceUp: true };
}
const wild = (id: string): Card => ({ id, deckType: 'phase10', phase10Type: 'wild', value: 25, faceUp: true });
const skip = (id: string): Card => ({ id, deckType: 'phase10', phase10Type: 'skip', value: 15, faceUp: true });

describe('canPhase10HitMeld — sets', () => {
  const fives = [num('a', 5), num('b', 5, 'blue'), num('c', 5, 'green')];

  it('accepts a matching rank', () => {
    expect(canPhase10HitMeld(num('d', 5, 'yellow'), 'set', fives)).toBe(true);
  });
  it('rejects a non-matching rank', () => {
    expect(canPhase10HitMeld(num('d', 4), 'set', fives)).toBe(false);
  });
  it('accepts a wild', () => {
    expect(canPhase10HitMeld(wild('w'), 'set', fives)).toBe(true);
  });
  it('rejects a skip', () => {
    expect(canPhase10HitMeld(skip('s'), 'set', fives)).toBe(false);
  });
});

describe('canPhase10HitMeld — runs', () => {
  const run8to11 = [num('a', 8), num('b', 9), num('c', 10), num('d', 11)];

  it('accepts adjacent-below (7)', () => {
    expect(canPhase10HitMeld(num('h', 7), 'run', run8to11)).toBe(true);
  });
  it('accepts adjacent-above (12)', () => {
    expect(canPhase10HitMeld(num('h', 12), 'run', run8to11)).toBe(true);
  });
  it('rejects non-adjacent-below (6)', () => {
    expect(canPhase10HitMeld(num('h', 6), 'run', run8to11)).toBe(false);
  });
  it('rejects non-adjacent-above-far (1)', () => {
    expect(canPhase10HitMeld(num('h', 1), 'run', run8to11)).toBe(false);
  });
  it('rejects duplicate value already in run', () => {
    expect(canPhase10HitMeld(num('h', 9), 'run', run8to11)).toBe(false);
  });
  it('after a 7 is added, accepts 6 or 12', () => {
    const extended = [...run8to11, num('h', 7)];
    expect(canPhase10HitMeld(num('x', 6), 'run', extended)).toBe(true);
    expect(canPhase10HitMeld(num('x', 12), 'run', extended)).toBe(true);
  });
  it('after a 7 is added, rejects 5', () => {
    const extended = [...run8to11, num('h', 7)];
    expect(canPhase10HitMeld(num('x', 5), 'run', extended)).toBe(false);
  });
  it('accepts wild as long as range 1-12 isn\'t saturated', () => {
    expect(canPhase10HitMeld(wild('w'), 'run', run8to11)).toBe(true);
  });
  it('allows a hit that lands within a wild-padded range', () => {
    // Run is W-8-9-10 (W stands in for 7): non-wild min=8, max=10, 1 wild.
    // Hitting 6 is legal — new span would be 6..10 (5 positions), 4 non-wilds +
    // 1 wild → 0 gaps needed but we use 1 wild so span = 5 = 4 + 1. Works.
    const paddedRun = [wild('w'), num('a', 8), num('b', 9), num('c', 10)];
    expect(canPhase10HitMeld(num('h', 6), 'run', paddedRun)).toBe(true);
    // But 5 would need 2 wilds for the gap — only have 1. Reject.
    expect(canPhase10HitMeld(num('h', 5), 'run', paddedRun)).toBe(false);
  });
});

describe('canPhase10HitMeld — colours', () => {
  const redSeven = [num('r1', 1), num('r2', 2), num('r3', 3), num('r4', 4), num('r5', 5), num('r6', 6), num('r7', 7)];

  it('accepts matching colour', () => {
    expect(canPhase10HitMeld(num('r8', 8, 'red'), 'color', redSeven)).toBe(true);
  });
  it('rejects mismatched colour', () => {
    expect(canPhase10HitMeld(num('b8', 8, 'blue'), 'color', redSeven)).toBe(false);
  });
  it('accepts wild', () => {
    expect(canPhase10HitMeld(wild('w'), 'color', redSeven)).toBe(true);
  });
});

describe('canPhase10HitMeld — defensive', () => {
  it('rejects a skip on any type', () => {
    expect(canPhase10HitMeld(skip('s'), 'set', [num('a', 5)])).toBe(false);
    expect(canPhase10HitMeld(skip('s'), 'run', [num('a', 5)])).toBe(false);
    expect(canPhase10HitMeld(skip('s'), 'color', [num('a', 5)])).toBe(false);
  });
  it('is permissive when existing cards array is empty (legacy state)', () => {
    expect(canPhase10HitMeld(num('a', 5), 'set', [])).toBe(true);
  });
});
