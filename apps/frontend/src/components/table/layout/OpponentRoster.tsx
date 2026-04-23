/**
 * OpponentRoster -- top row of the table layout.
 *
 * Renders up to three top-positioned opponents in fixed slots so their
 * horizontal position stays stable regardless of how many are present:
 *
 *   [ top-left ] [ top-center ] [ top-right ]
 *
 * Each slot is an independently centered flex column (badge stacked above
 * its melds panel).  Empty slots still occupy their grid cell so the felt
 * below stays centred.
 *
 * Presentational only: no store reads, no socket calls.
 */
import React from 'react';

export interface OpponentRosterProps {
  /** Occupant of the top-left grid slot (5p / 6p layouts). */
  leftSlot?: React.ReactNode;
  /** Occupant of the top-center grid slot (2p / 3p / 4p / 6p layouts). */
  centerSlot?: React.ReactNode;
  /** Occupant of the top-right grid slot (5p / 6p layouts). */
  rightSlot?: React.ReactNode;
}

export function OpponentRoster({
  leftSlot,
  centerSlot,
  rightSlot,
}: OpponentRosterProps) {
  const hasAnyOpponent = !!(leftSlot || centerSlot || rightSlot);
  if (!hasAnyOpponent) return null;

  return (
    <div
      className={[
        'relative z-10 w-full',
        'grid grid-cols-3 items-end justify-items-center',
        'gap-3 sm:gap-5 lg:gap-8',
        'px-3 sm:px-6 lg:px-10 pt-2 pb-1',
      ].join(' ')}
      data-testid="opponent-roster"
    >
      <div
        className="flex flex-col items-center gap-2 min-w-0 max-w-full"
        data-slot="top-left"
      >
        {leftSlot}
      </div>
      <div
        className="flex flex-col items-center gap-2 min-w-0 max-w-full"
        data-slot="top-center"
      >
        {centerSlot}
      </div>
      <div
        className="flex flex-col items-center gap-2 min-w-0 max-w-full"
        data-slot="top-right"
      >
        {rightSlot}
      </div>
    </div>
  );
}
