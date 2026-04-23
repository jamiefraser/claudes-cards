/**
 * OpponentRoster -- horizontal flex container above the felt.
 *
 * Only renders top-oriented opponents (badges + meld panels).
 * Presentational only: no store reads, no socket calls.
 */
import React from 'react';

export interface OpponentRosterProps {
  children: React.ReactNode;
}

export function OpponentRoster({ children }: OpponentRosterProps) {
  return (
    <div
      className="flex flex-row flex-wrap gap-5 items-start justify-center px-3 sm:px-6 py-3"
      data-testid="opponent-roster"
    >
      {children}
    </div>
  );
}
