/**
 * CanastaMeldTargetModal
 *
 * Shown when the player clicks Meld in Canasta with a selection that contains
 * only wild cards (2s or jokers). The engine needs to know which existing
 * meld the wilds should extend — they can't be a brand-new meld because a
 * meld must contain more naturals than wilds. The modal lists the player's
 * side's extendable melds (excludes black-3 exit melds) and calls
 * `onPick(rank)` with the chosen target rank.
 */
import React from 'react';
import { Modal } from '@/components/shared/Modal';
import en from '@/i18n/en.json';

export interface CanastaExtendableMeld {
  readonly rank: string;
  readonly naturals: number;
  readonly wilds: number;
  readonly isCanasta: boolean;
}

export interface CanastaMeldTargetModalProps {
  readonly isOpen: boolean;
  readonly melds: readonly CanastaExtendableMeld[];
  readonly onPick: (rank: string) => void;
  readonly onClose: () => void;
}

export function CanastaMeldTargetModal({
  isOpen,
  melds,
  onPick,
  onClose,
}: CanastaMeldTargetModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={en.table.canastaExtendTitle}>
      {melds.length === 0 ? (
        <p className="text-parchment/80 text-sm">{en.table.canastaExtendNone}</p>
      ) : (
        <>
          <p className="text-parchment/80 text-sm mb-3">
            {en.table.canastaExtendPrompt}
          </p>
          <div className="flex flex-col gap-2">
            {melds.map((m) => (
              <button
                key={m.rank}
                type="button"
                onClick={() => onPick(m.rank)}
                className={[
                  'w-full px-4 py-2.5 rounded-full text-sm font-semibold tracking-wide',
                  'bg-gradient-to-b from-brass-bright to-brass text-night',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
                  'hover:brightness-105 active:translate-y-[1px]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
                  'flex items-center justify-between gap-3',
                ].join(' ')}
                aria-label={en.table.canastaExtendButton.replace('{rank}', m.rank)}
              >
                <span>{en.table.canastaExtendButton.replace('{rank}', m.rank)}</span>
                <span className="text-xs font-display opacity-80 tabular-nums">
                  {m.naturals}N / {m.wilds}W
                  {m.isCanasta ? ' · canasta' : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
