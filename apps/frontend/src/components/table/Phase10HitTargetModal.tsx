/**
 * Phase10HitTargetModal
 *
 * Shown when the player has already laid down their phase and wants to
 * "hit" (lay off) one or more cards onto an existing meld. The engine's
 * `hit-meld` action requires both `targetPlayerId` and `groupIndex`, so for
 * any ambiguity (e.g. a single wild that could land on any group) we ask
 * the player to pick the target visually.
 */
import React from 'react';
import type { Card } from '@shared/cards';
import { Modal } from '@/components/shared/Modal';
import { CardComponent } from '@/components/cards/CardComponent';
import en from '@/i18n/en.json';

export interface Phase10HitTarget {
  readonly targetPlayerId: string;
  readonly targetPlayerName: string;
  readonly groupIndex: number;
  readonly type: 'set' | 'run' | 'color';
  readonly cards: Card[];
}

export interface Phase10HitTargetModalProps {
  readonly isOpen: boolean;
  readonly targets: readonly Phase10HitTarget[];
  readonly onPick: (target: Phase10HitTarget) => void;
  readonly onClose: () => void;
}

const TYPE_LABEL: Record<'set' | 'run' | 'color', string> = {
  set: 'Set',
  run: 'Run',
  color: 'Colour',
};

export function Phase10HitTargetModal({
  isOpen,
  targets,
  onPick,
  onClose,
}: Phase10HitTargetModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={en.table.phase10HitTitle}>
      {targets.length === 0 ? (
        <p className="text-parchment/80 text-sm">{en.table.phase10HitNone}</p>
      ) : (
        <>
          <p className="text-parchment/80 text-sm mb-3">{en.table.phase10HitPrompt}</p>
          <div className="flex flex-col gap-3">
            {targets.map((t) => (
              <button
                key={`${t.targetPlayerId}:${t.groupIndex}`}
                type="button"
                onClick={() => onPick(t)}
                className={[
                  'w-full px-3 py-2 rounded-lg border border-brass/40',
                  'bg-night-raised/70 hover:bg-night-raised',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
                  'flex flex-col items-start gap-2',
                ].join(' ')}
                aria-label={en.table.phase10HitButton
                  .replace('{name}', t.targetPlayerName)
                  .replace('{type}', TYPE_LABEL[t.type])}
              >
                <span className="text-xs uppercase tracking-wide text-brass-bright/80">
                  {t.targetPlayerName} · {TYPE_LABEL[t.type]}
                </span>
                <div className="flex flex-row -space-x-4">
                  {t.cards.map((c) => (
                    <div key={c.id} className="scale-50 origin-top-left">
                      <CardComponent card={c} faceUp selected={false} />
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
