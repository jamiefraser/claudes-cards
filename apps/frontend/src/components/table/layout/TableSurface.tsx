/**
 * TableSurface -- thin wrapper around TableFelt providing
 * position:relative and slots for edge-anchored children
 * (side opponents, tucked meld panels).
 *
 * Presentational only: no store reads, no socket calls.
 * overflow: visible so the 48px tuck-in meld panels are not clipped.
 */
import React from 'react';

export interface TableSurfaceProps {
  children: React.ReactNode;
}

export function TableSurface({ children }: TableSurfaceProps) {
  return (
    <div
      className="relative w-full flex items-center justify-center px-3 sm:px-6 py-4 sm:py-6"
      data-testid="table-surface"
      style={{ overflow: 'visible' }}
    >
      {children}
    </div>
  );
}
