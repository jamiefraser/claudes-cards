/**
 * OpponentBadge -- wrapper around BotSeat / PlayerSeat that applies
 * rotation for side-positioned opponents (left / right).
 *
 * Presentational only: no store reads, no socket calls.
 *
 * Rotation rule (desktop + tablet):
 *   - left  -> rotate(90deg)   (text reads bottom-to-top)
 *   - right -> rotate(-90deg)  (text reads top-to-bottom)
 *   - top   -> no rotation
 *
 * The rotated container carries an aria-label so screen readers get
 * a flat reading order regardless of the visual rotation.
 */
import React from 'react';
import type { SeatOrientation } from './seatMap';

export interface OpponentBadgeProps {
  orientation: SeatOrientation;
  /** Display name for aria-label on the rotated container. */
  displayName: string;
  children: React.ReactNode;
}

const ROTATION: Record<SeatOrientation, string> = {
  top:   '',
  left:  'rotate(90deg)',
  right: 'rotate(-90deg)',
};

export function OpponentBadge({
  orientation,
  displayName,
  children,
}: OpponentBadgeProps) {
  const rotation = ROTATION[orientation];

  return (
    <div
      className="flex flex-col items-center"
      style={rotation ? { transform: rotation } : undefined}
      aria-label={`${displayName}'s seat`}
      data-testid="opponent-badge"
      data-orientation={orientation}
    >
      {children}
    </div>
  );
}
