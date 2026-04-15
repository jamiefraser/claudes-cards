import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRadialSeats, computeRadialSeats } from './useRadialSeats';

describe('computeRadialSeats', () => {
  it('places the self seat at bottom-center', () => {
    const seats = computeRadialSeats({ count: 4, rx: 100, ry: 60, cx: 0, cy: 0 });
    expect(seats).toHaveLength(4);
    const self = seats[0];
    expect(self.x).toBeCloseTo(0, 5);
    expect(self.y).toBeCloseTo(60, 5);
    expect(self.isSelf).toBe(true);
  });

  it('distributes N seats at evenly spaced angles', () => {
    const seats = computeRadialSeats({ count: 4, rx: 100, ry: 100, cx: 0, cy: 0 });
    const expected = [90, 180, 270, 0];
    seats.forEach((s, i) => {
      expect(s.angleDeg).toBeCloseTo(expected[i], 1);
    });
  });

  it('head-to-head: two players are at opposite ends of the long axis', () => {
    const seats = computeRadialSeats({ count: 2, rx: 200, ry: 100, cx: 0, cy: 0 });
    expect(seats[0].y).toBeCloseTo(100, 5);
    expect(seats[1].y).toBeCloseTo(-100, 5);
    expect(seats[0].x).toBeCloseTo(0, 5);
    expect(seats[1].x).toBeCloseTo(0, 5);
  });

  it('six players: adjacent seat angles differ by 60°', () => {
    const seats = computeRadialSeats({ count: 6, rx: 100, ry: 100, cx: 0, cy: 0 });
    for (let i = 1; i < seats.length; i++) {
      const delta = (seats[i].angleDeg - seats[i - 1].angleDeg + 360) % 360;
      expect(delta).toBeCloseTo(60, 1);
    }
  });

  it('positions are on the ellipse perimeter', () => {
    const rx = 240, ry = 140;
    const seats = computeRadialSeats({ count: 5, rx, ry, cx: 0, cy: 0 });
    for (const s of seats) {
      const onEllipse = (s.x * s.x) / (rx * rx) + (s.y * s.y) / (ry * ry);
      expect(onEllipse).toBeCloseTo(1, 5);
    }
  });

  it('respects a non-zero centre', () => {
    const seats = computeRadialSeats({ count: 2, rx: 50, ry: 50, cx: 400, cy: 300 });
    expect(seats[0].x).toBeCloseTo(400, 5);
    expect(seats[0].y).toBeCloseTo(350, 5);
  });

  it('returns an empty array when count is zero', () => {
    expect(computeRadialSeats({ count: 0, rx: 100, ry: 100, cx: 0, cy: 0 })).toEqual([]);
  });

  it('single-player table just places self at bottom', () => {
    const seats = computeRadialSeats({ count: 1, rx: 100, ry: 80, cx: 0, cy: 0 });
    expect(seats).toHaveLength(1);
    expect(seats[0].y).toBeCloseTo(80, 5);
    expect(seats[0].isSelf).toBe(true);
  });
});

describe('useRadialSeats hook', () => {
  it('returns the same output as computeRadialSeats for given inputs', () => {
    const args = { count: 3, rx: 200, ry: 120, cx: 500, cy: 300 } as const;
    const { result } = renderHook(() => useRadialSeats(args));
    expect(result.current).toEqual(computeRadialSeats(args));
  });

  it('memoises across re-renders with stable inputs', () => {
    const args = { count: 4, rx: 200, ry: 120, cx: 0, cy: 0 };
    const { result, rerender } = renderHook(() => useRadialSeats(args));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
