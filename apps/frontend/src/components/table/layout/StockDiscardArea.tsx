/**
 * StockDiscardArea -- horizontal pair centered in the lower-middle
 * third of the felt.  Wraps the draw and discard PileComponents.
 *
 * Presentational only: no store reads, no socket calls.
 */
import React from 'react';

export interface StockDiscardAreaProps {
  children: React.ReactNode;
}

export function StockDiscardArea({ children }: StockDiscardAreaProps) {
  return (
    <div
      className="flex flex-row flex-wrap gap-6 items-center justify-center"
      data-testid="stock-discard-area"
    >
      {children}
    </div>
  );
}
