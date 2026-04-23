/**
 * TableSurface -- the main stage for a rummy-family table.
 *
 * Organises the three horizontal zones around the felt using CSS Grid:
 *   +---------+--------+---------+
 *   | opp-left|  felt  | opp-right
 *   +---------+--------+---------+
 *
 * Children are slotted by `data-slot` (`left`, `stage`, `right`) so the grid
 * reserves viewport space for every seat regardless of whether the slot is
 * populated.  Empty slots still exist -- they just collapse visually.
 *
 * Presentational only: no store reads, no socket calls.
 * `overflow: visible` stays so that any animation origin just outside the
 * felt (e.g. a meld lay-down) is not clipped.
 */
import React from 'react';

export interface TableSurfaceProps {
  /** Rendered in the left column (side opponents at desktop/tablet). */
  leftSlot?: React.ReactNode;
  /** Rendered in the middle column — typically the felt + stock/discard. */
  stage: React.ReactNode;
  /** Rendered in the right column (side opponents at desktop/tablet). */
  rightSlot?: React.ReactNode;
}

export function TableSurface({ leftSlot, stage, rightSlot }: TableSurfaceProps) {
  return (
    <div
      className={[
        'relative w-full',
        // 3-col grid: side columns reserve a minimum width for a rotated
        // opponent (badge ~110px + melds). The middle column is `auto` so
        // the felt sizes itself to its contents (stock + discard + padding).
        'grid items-center justify-center',
        'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
        'sm:grid-cols-[minmax(140px,1fr)_auto_minmax(140px,1fr)]',
        'lg:grid-cols-[minmax(170px,1fr)_auto_minmax(170px,1fr)]',
        'gap-3 sm:gap-4 lg:gap-6',
        'px-3 sm:px-5 lg:px-8 py-2 sm:py-3',
      ].join(' ')}
      data-testid="table-surface"
      style={{ overflow: 'visible' }}
    >
      <div
        className="flex flex-col items-center justify-center gap-5"
        data-slot="opp-left"
      >
        {leftSlot}
      </div>
      <div
        className="flex items-center justify-center"
        data-slot="stage"
      >
        {stage}
      </div>
      <div
        className="flex flex-col items-center justify-center gap-5"
        data-slot="opp-right"
      >
        {rightSlot}
      </div>
    </div>
  );
}
