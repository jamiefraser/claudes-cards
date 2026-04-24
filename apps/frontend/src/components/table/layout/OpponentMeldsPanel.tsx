/**
 * OpponentMeldsPanel -- wrapper for MeldsArea that applies the same rotation
 * as the opponent's badge so the melds visually face the table centre.
 *
 *   - top   -> no rotation
 *   - left  -> rotate(-90deg)  (reads bottom-to-top)
 *   - right -> rotate(90deg)   (reads top-to-bottom)
 *
 * Like OpponentBadge, the rotated variants use an OUTER wrapper sized
 * to the POST-rotation visible footprint so grid cells measure correctly
 * and the viewport doesn't clip side opponents in 3+ player games.
 *
 * Overflow behaviour:
 *   - Top slot: `max-w` caps the un-rotated width, overflow-x scrolls.
 *   - Side slots: pre-rotation `maxHeight` caps the height, which after
 *     rotation becomes the visible WIDTH. Content that exceeds the cap
 *     scrolls along the pre-rotation horizontal axis — which visually
 *     reads as vertical scroll after the 90° transform.
 *
 * Presentational only: no store reads, no socket calls.
 */
import React from 'react';
import type { SeatOrientation } from './seatMap';

export interface OpponentMeldsPanelProps {
  orientation: SeatOrientation;
  children: React.ReactNode;
}

const ROTATION: Record<SeatOrientation, string> = {
  top:   '',
  left:  'rotate(-90deg)',
  right: 'rotate(90deg)',
};

// Top: un-rotated cap on width. Overflow scrolls horizontally within.
const TOP_MAX_WIDTH = 360;

// Sides: outer reserves visible footprint = 220w × 260h. Inner is
// un-rotated with maxWidth=260 and maxHeight=220; after rotation the
// visual rect is (inner-height × inner-width) = (≤220 × ≤260), which
// fits exactly inside the outer's reserved box.
const SIDE_OUTER = { w: 220, h: 260 };
const SIDE_INNER = { maxW: 260, maxH: 220 };

export function OpponentMeldsPanel({
  orientation,
  children,
}: OpponentMeldsPanelProps) {
  if (orientation === 'top') {
    return (
      <div
        className="flex flex-col items-center no-scrollbar"
        style={{
          maxWidth: TOP_MAX_WIDTH,
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
        data-testid="opponent-melds-panel"
        data-orientation="top"
      >
        {children}
      </div>
    );
  }

  const rotation = ROTATION[orientation];

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: SIDE_OUTER.w, height: SIDE_OUTER.h }}
      data-testid="opponent-melds-panel"
      data-orientation={orientation}
    >
      <div
        className="flex flex-col items-center no-scrollbar shrink-0"
        style={{
          maxWidth: SIDE_INNER.maxW,
          maxHeight: SIDE_INNER.maxH,
          overflowX: 'auto',
          overflowY: 'hidden',
          transform: rotation,
          transformOrigin: 'center',
        }}
        data-testid="opponent-melds-panel-rotator"
      >
        {children}
      </div>
    </div>
  );
}
