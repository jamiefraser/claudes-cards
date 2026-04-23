/**
 * CanastaWildDistributionModal
 *
 * Shown when the player clicks Meld with a multi-rank selection that includes
 * wild cards. The user must decide how many wilds go to each natural rank
 * group before the melds can be submitted. Each rank group needs at least 3
 * cards, and wilds must remain the minority (< naturals) in each group.
 *
 * DEF-002 — option (a): distribute wilds across rank groups.
 */
import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/shared/Modal';
import en from '@/i18n/en.json';

export interface RankGroup {
  readonly rank: string;
  readonly naturalCardIds: string[];
}

export interface CanastaWildDistributionModalProps {
  readonly isOpen: boolean;
  readonly rankGroups: readonly RankGroup[];
  readonly wildCardIds: string[];
  readonly onConfirm: (distribution: Array<{ cardIds: string[]; rank: string }>) => void;
  readonly onClose: () => void;
}

export function CanastaWildDistributionModal({
  isOpen,
  rankGroups,
  wildCardIds,
  onConfirm,
  onClose,
}: CanastaWildDistributionModalProps) {
  // Track how many wilds are assigned to each rank.
  const [wildCounts, setWildCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const g of rankGroups) init[g.rank] = 0;
    return init;
  });

  const totalAssigned = useMemo(
    () => Object.values(wildCounts).reduce((sum, n) => sum + n, 0),
    [wildCounts],
  );
  const remaining = wildCardIds.length - totalAssigned;

  // Validation: each group must have >= 3 total cards and wilds < naturals.
  const isValid = useMemo(() => {
    for (const g of rankGroups) {
      const nats = g.naturalCardIds.length;
      const w = wildCounts[g.rank] ?? 0;
      if (nats + w < 3) return false;
      if (w >= nats) return false;
    }
    return remaining === 0;
  }, [rankGroups, wildCounts, remaining]);

  const increment = (rank: string) => {
    if (remaining <= 0) return;
    const nats = rankGroups.find((g) => g.rank === rank)?.naturalCardIds.length ?? 0;
    const current = wildCounts[rank] ?? 0;
    // Wilds must stay strictly less than naturals and at most 3.
    if (current + 1 >= nats) return;
    if (current + 1 > 3) return;
    setWildCounts((prev) => ({ ...prev, [rank]: current + 1 }));
  };

  const decrement = (rank: string) => {
    const current = wildCounts[rank] ?? 0;
    if (current <= 0) return;
    setWildCounts((prev) => ({ ...prev, [rank]: current - 1 }));
  };

  const handleConfirm = () => {
    if (!isValid) return;
    let wildIdx = 0;
    const result: Array<{ cardIds: string[]; rank: string }> = [];
    for (const g of rankGroups) {
      const w = wildCounts[g.rank] ?? 0;
      const assignedWilds = wildCardIds.slice(wildIdx, wildIdx + w);
      wildIdx += w;
      result.push({
        rank: g.rank,
        cardIds: [...g.naturalCardIds, ...assignedWilds],
      });
    }
    onConfirm(result);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={en.table.canastaDistributeTitle}>
      <p className="text-parchment/80 text-sm mb-3">
        {en.table.canastaDistributePrompt}
      </p>
      <div className="flex flex-col gap-3 mb-4">
        {rankGroups.map((g) => {
          const w = wildCounts[g.rank] ?? 0;
          const total = g.naturalCardIds.length + w;
          return (
            <div key={g.rank} className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-parchment min-w-[60px]">
                {g.rank}s ({g.naturalCardIds.length}N)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decrement(g.rank)}
                  disabled={w <= 0}
                  className="w-8 h-8 rounded-full bg-paper-deep/40 text-ink-soft hover:bg-paper-deep/70 disabled:opacity-30 text-sm font-bold"
                  aria-label={`Remove a wild from ${g.rank}s`}
                >
                  -
                </button>
                <span className="text-sm tabular-nums min-w-[24px] text-center text-parchment">
                  {w}W
                </span>
                <button
                  type="button"
                  onClick={() => increment(g.rank)}
                  disabled={remaining <= 0}
                  className="w-8 h-8 rounded-full bg-paper-deep/40 text-ink-soft hover:bg-paper-deep/70 disabled:opacity-30 text-sm font-bold"
                  aria-label={`Add a wild to ${g.rank}s`}
                >
                  +
                </button>
                <span className="text-xs text-parchment/60 ml-1">
                  = {total} cards
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-parchment/60">
          {en.table.canastaDistributeRemaining.replace('{count}', String(remaining))}
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid}
          className={[
            'px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide',
            isValid
              ? 'bg-gradient-to-b from-brass-bright to-brass text-night shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-105 active:translate-y-[1px]'
              : 'bg-paper-deep/50 text-whisper/70 cursor-not-allowed',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
          ].join(' ')}
        >
          {en.table.canastaDistributeConfirm}
        </button>
      </div>
    </Modal>
  );
}
