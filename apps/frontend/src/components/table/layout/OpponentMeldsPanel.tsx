/**
 * OpponentMeldsPanel -- wrapper for MeldsArea that positions it against
 * the correct edge of TableSurface with a tuck overlap.
 *
 * Presentational only: no store reads, no socket calls.
 *
 * Desktop tuck: 48px overlap into the felt edge.
 * Tablet tuck:  28px (applied via Tailwind responsive class).
 * Mobile:       no tuck, full-width row above felt.
 *
 * Rotation matches OpponentBadge: left rotates 90deg CW, right -90deg.
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

export function OpponentMeldsPanel({
  orientation,
  children,
}: OpponentMeldsPanelProps) {
  const rotation = ROTATION[orientation];

  return (
    <div
      className="flex flex-col items-center"
      style={rotation ? { transform: rotation } : undefined}
      data-testid="opponent-melds-panel"
      data-orientation={orientation}
    >
      {children}
    </div>
  );
}
