/**
 * seatMap — clock-face seat-placement map for rummy-family games.
 *
 * Self is always at the bottom of the table. Opponents are indexed
 * clockwise starting from the seat immediately left of self.
 *
 * The map drives OpponentBadge and OpponentMeldsPanel placement +
 * rotation.  It is pure data — no store reads, no side effects.
 */

export type SeatOrientation = 'top' | 'left' | 'right';

export interface SeatPlacement {
  position: 'top-left' | 'top-center' | 'top-right' | 'left' | 'right';
  orientation: SeatOrientation;
}

export const SEAT_MAPS: Record<number, SeatPlacement[]> = {
  2: [
    { position: 'top-center', orientation: 'top' },
  ],
  3: [
    { position: 'left',       orientation: 'left' },
    { position: 'top-center', orientation: 'top' },
  ],
  4: [
    { position: 'left',       orientation: 'left' },
    { position: 'top-center', orientation: 'top' },
    { position: 'right',      orientation: 'right' },
  ],
  5: [
    { position: 'left',       orientation: 'left' },
    { position: 'top-left',   orientation: 'top' },
    { position: 'top-right',  orientation: 'top' },
    { position: 'right',      orientation: 'right' },
  ],
  6: [
    { position: 'left',       orientation: 'left' },
    { position: 'top-left',   orientation: 'top' },
    { position: 'top-center', orientation: 'top' },
    { position: 'top-right',  orientation: 'top' },
    { position: 'right',      orientation: 'right' },
  ],
};

/**
 * Returns the seat placements for the given player count.
 * Falls back to 2p if the count is out of range.
 */
export function getSeatPlacements(playerCount: number): SeatPlacement[] {
  return SEAT_MAPS[playerCount] ?? SEAT_MAPS[2]!;
}
