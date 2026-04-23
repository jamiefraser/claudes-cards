/**
 * OpponentRoster -- horizontal flex container above the felt.
 *
 * Only renders top-oriented opponents (badges + meld panels).
 * Presentational only: no store reads, no socket calls.
 *
 * The `tuckOverlap` prop (in px) creates a negative bottom margin
 * so the roster's meld panels visually tuck into the felt's top edge.
 * Desktop default: 48px.  Tablet: 28px.  Mobile: 0.
 */
import React from 'react';

export interface OpponentRosterProps {
  children: React.ReactNode;
  /** Negative bottom margin in px so melds overlap the felt edge. */
  tuckOverlap?: number;
}

export function OpponentRoster({ children, tuckOverlap = 0 }: OpponentRosterProps) {
  return (
    <div
      className="relative z-10 flex flex-row flex-wrap gap-5 items-start justify-center px-3 sm:px-6 py-3"
      style={tuckOverlap > 0 ? { marginBottom: -tuckOverlap } : undefined}
      data-testid="opponent-roster"
    >
      {children}
    </div>
  );
}
