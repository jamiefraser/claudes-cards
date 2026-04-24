/**
 * OpponentBadge -- wrapper around BotSeat / PlayerSeat that applies
 * rotation for side-positioned opponents (left / right).
 *
 * Presentational only: no store reads, no socket calls.
 *
 * Rotation rule (desktop + tablet) — "cards face the table centre from
 * the player's seat":
 *   - left  -> rotate(-90deg)  (CCW; text reads bottom-to-top)
 *   - right -> rotate(90deg)   (CW;  text reads top-to-bottom)
 *   - top   -> no rotation
 *
 * Why the nested wrapper on rotated orientations:
 *   CSS `transform` does NOT change the DOM layout box of the rotated
 *   element, so a naïvely-rotated badge still reserves its un-rotated
 *   width+height in the grid and bleeds its visual footprint outside
 *   the parent. That was the root cause of the 3+ player clipping —
 *   the left/right opponent's rotated visual overflowed the viewport
 *   edge even though its DOM layout sat inside a grid cell.
 *
 *   Fix: the OUTER element reserves the POST-rotation visible footprint
 *   (`w` × `h` below). The INNER element is un-rotated at the seat's
 *   natural dims and centre-rotated. With flex centre alignment, the
 *   inner's centre coincides with the outer's centre, so the rotated
 *   visual rectangle lands exactly inside the outer's reserved box.
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
  left:  'rotate(-90deg)',
  right: 'rotate(90deg)',
};

// POST-rotation visible footprint per orientation. A PlayerSeat/BotSeat
// is naturally portrait (~110w × ~220h). Rotated 90°, the visual becomes
// landscape — width = the seat's natural height, height = the seat's
// natural width. The outer wrapper reserves that landscape box so the
// grid cell measures correctly and nothing bleeds past the viewport.
const POST_ROTATION_BOX: Record<SeatOrientation, { w: number; h: number } | null> = {
  top:   null,
  left:  { w: 220, h: 120 },
  right: { w: 220, h: 120 },
};

export function OpponentBadge({
  orientation,
  displayName,
  children,
}: OpponentBadgeProps) {
  const rotation = ROTATION[orientation];
  const box = POST_ROTATION_BOX[orientation];

  if (!box) {
    return (
      <div
        className="flex flex-col items-center"
        aria-label={`${displayName}'s seat`}
        data-testid="opponent-badge"
        data-orientation={orientation}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: box.w, height: box.h }}
      aria-label={`${displayName}'s seat`}
      data-testid="opponent-badge"
      data-orientation={orientation}
    >
      <div
        className="flex flex-col items-center shrink-0"
        style={{ transform: rotation, transformOrigin: 'center' }}
        data-testid="opponent-badge-rotator"
      >
        {children}
      </div>
    </div>
  );
}
