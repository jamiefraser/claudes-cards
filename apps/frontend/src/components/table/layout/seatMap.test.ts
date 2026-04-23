import { describe, it, expect } from 'vitest';
import { getSeatPlacements, SEAT_MAPS } from './seatMap';

describe('seatMap', () => {
  it('returns 1 opponent placement for 2-player', () => {
    const placements = getSeatPlacements(2);
    expect(placements).toHaveLength(1);
    expect(placements[0]).toEqual({ position: 'top-center', orientation: 'top' });
  });

  it('returns 2 opponent placements for 3-player', () => {
    const placements = getSeatPlacements(3);
    expect(placements).toHaveLength(2);
    expect(placements[0]!.position).toBe('left');
    expect(placements[0]!.orientation).toBe('left');
    expect(placements[1]!.position).toBe('top-center');
    expect(placements[1]!.orientation).toBe('top');
  });

  it('returns 3 opponent placements for 4-player', () => {
    const placements = getSeatPlacements(4);
    expect(placements).toHaveLength(3);
    expect(placements.map(p => p.position)).toEqual(['left', 'top-center', 'right']);
  });

  it('returns 4 opponent placements for 5-player', () => {
    const placements = getSeatPlacements(5);
    expect(placements).toHaveLength(4);
    expect(placements.map(p => p.position)).toEqual([
      'left', 'top-left', 'top-right', 'right',
    ]);
  });

  it('returns 5 opponent placements for 6-player', () => {
    const placements = getSeatPlacements(6);
    expect(placements).toHaveLength(5);
    expect(placements.map(p => p.position)).toEqual([
      'left', 'top-left', 'top-center', 'top-right', 'right',
    ]);
  });

  it('falls back to 2-player for unknown counts', () => {
    expect(getSeatPlacements(1)).toEqual(SEAT_MAPS[2]);
    expect(getSeatPlacements(7)).toEqual(SEAT_MAPS[2]);
  });

  it('left-position opponents have left orientation', () => {
    for (const count of [3, 4, 5, 6]) {
      const leftSeat = getSeatPlacements(count).find(p => p.position === 'left');
      expect(leftSeat?.orientation).toBe('left');
    }
  });

  it('right-position opponents have right orientation', () => {
    for (const count of [4, 5, 6]) {
      const rightSeat = getSeatPlacements(count).find(p => p.position === 'right');
      expect(rightSeat?.orientation).toBe('right');
    }
  });

  it('top-position opponents have top orientation', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const topSeats = getSeatPlacements(count).filter(
        p => p.position.startsWith('top'),
      );
      for (const seat of topSeats) {
        expect(seat.orientation).toBe('top');
      }
    }
  });
});
