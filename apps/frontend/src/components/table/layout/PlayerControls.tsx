/**
 * PlayerControls -- row below the hand: name + score pill (left)
 * and sort pills (Rank / Suit) right.
 *
 * Presentational only: no store reads, no socket calls.
 */
import React from 'react';
import { formatScore } from '@/utils/formatScore';
import en from '@/i18n/en.json';

export interface PlayerControlsProps {
  displayName: string;
  score: number;
  isDealer: boolean;
  onSortByRank: () => void;
  onSortBySuit: () => void;
}

export function PlayerControls({
  displayName,
  score,
  isDealer,
  onSortByRank,
  onSortBySuit,
}: PlayerControlsProps) {
  return (
    <div
      className="flex flex-row items-center gap-2 sm:gap-3 flex-wrap justify-center max-w-full px-2 min-w-0"
      data-testid="player-controls"
    >
      <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-full bg-paper-raised/80 border border-hairline/70 font-display text-sm min-w-0">
        <span className="text-ink truncate max-w-[10rem] min-w-0" translate="no">
          {displayName}
        </span>
        <span aria-hidden className="text-whisper">
          {'·'}
        </span>
        <span className="font-mono text-ochre text-xs tabular-nums" translate="no">
          {formatScore(score)}
        </span>
        {isDealer && (
          <span
            title={en.table.dealerBadgeTooltip}
            className="w-5 h-5 rounded-full bg-ochre text-paper font-bold text-[0.7rem] flex items-center justify-center"
          >
            D
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onSortByRank}
        className="min-h-[36px] text-xs font-medium tracking-wide text-ink-soft bg-paper-raised/60 hover:bg-paper-raised border border-hairline/60 hover:border-ochre rounded-full px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
        aria-label={en.table.sortHandByRank}
      >
        {en.table.sortRankShort}
      </button>
      <button
        type="button"
        onClick={onSortBySuit}
        className="min-h-[36px] text-xs font-medium tracking-wide text-ink-soft bg-paper-raised/60 hover:bg-paper-raised border border-hairline/60 hover:border-ochre rounded-full px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
        aria-label={en.table.sortHandBySuit}
      >
        {en.table.sortSuitShort}
      </button>
    </div>
  );
}
