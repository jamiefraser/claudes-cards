/**
 * OpponentMeldsPanel -- wrapper for MeldsArea that applies the same rotation
 * as the opponent's badge so the melds visually face the table centre.
 *
 *   - top   -> no rotation
 *   - left  -> rotate(90deg)   (reads bottom-to-top)
 *   - right -> rotate(-90deg)  (reads top-to-bottom)
 *
 * The panel is capped in its primary axis so an unusually-long meld set can
 * never push the felt or other seats off-screen. Past the cap, the panel
 * scrolls internally:
 *
 *   - top slot     -> horizontal scroll (`max-w` + `overflow-x-auto`)
 *   - left / right -> pre-rotation horizontal scroll, which reads as vertical
 *                     scroll on-screen after the 90deg rotation
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
  left:  'rotate(90deg)',
  right: 'rotate(-90deg)',
};

// Pre-rotation width caps. For rotated orientations this becomes the
// viewport-height budget once the panel is transformed onto its side.
const MAX_WIDTH: Record<SeatOrientation, number> = {
  top:   360,
  left:  260,
  right: 260,
};

export function OpponentMeldsPanel({
  orientation,
  children,
}: OpponentMeldsPanelProps) {
  const rotation = ROTATION[orientation];

  return (
    <div
      className="flex flex-col items-center no-scrollbar"
      style={{
        transform: rotation || undefined,
        maxWidth: MAX_WIDTH[orientation],
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
      data-testid="opponent-melds-panel"
      data-orientation={orientation}
    >
      {children}
    </div>
  );
}
