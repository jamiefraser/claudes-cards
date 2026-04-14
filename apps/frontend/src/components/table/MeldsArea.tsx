/**
 * MeldsArea — renders a player's laid-down phase groups face-up.
 * Used below each player's seat (including the local player) once they
 * have completed their phase.
 */
import React from 'react';
import type { Card } from '@shared/cards';
import { CardComponent } from '../cards/CardComponent';

export interface MeldGroup {
  type: 'set' | 'run' | 'color';
  cardIds: string[];
}

export interface MeldsAreaProps {
  /**
   * Groups laid down by the player. Each group's cardIds is an ordered list
   * — the caller must also supply the card catalogue so we can look them up
   * by id (cards no longer live in the hand once laid down).
   */
  groups: MeldGroup[];
  /**
   * Catalogue of every card on the table keyed by id. We look up laid-down
   * cards here rather than requiring the full Card object on each group.
   */
  cardCatalogue: Record<string, Card>;
  /** Label shown above the melds (e.g. "Your melds", "Ada's melds"). */
  label?: string;
  /** Layout scale: compact renders smaller cards for opponent seats. */
  compact?: boolean;
}

function GroupTypeBadge({ type }: { type: MeldGroup['type'] }) {
  const labels: Record<MeldGroup['type'], string> = {
    set: 'Set',
    run: 'Run',
    color: 'Colour',
  };
  return (
    <span className="text-xs uppercase tracking-wide text-slate-400 mb-1">
      {labels[type]}
    </span>
  );
}

export function MeldsArea({
  groups,
  cardCatalogue,
  label,
  compact = false,
}: MeldsAreaProps) {
  if (groups.length === 0) return null;

  return (
    <div
      className={[
        'flex flex-col items-center gap-1 p-2 rounded-md',
        'bg-slate-800/60 border border-slate-700',
        compact ? 'text-xs' : 'text-sm',
      ].join(' ')}
      aria-label={label ?? 'Laid-down melds'}
    >
      {label && (
        <span className="text-slate-300 font-medium mb-1">{label}</span>
      )}
      <div className="flex flex-row gap-3 flex-wrap justify-center">
        {groups.map((group, gi) => {
          const cards = group.cardIds
            .map(id => cardCatalogue[id])
            .filter((c): c is Card => !!c);
          return (
            <div
              key={gi}
              className="flex flex-col items-center"
              aria-label={`${group.type} of ${cards.length}`}
            >
              <GroupTypeBadge type={group.type} />
              <div
                className={
                  compact
                    ? 'flex flex-row -space-x-3'
                    : 'flex flex-row -space-x-4'
                }
              >
                {cards.map(card => (
                  <div
                    key={card.id}
                    className={compact ? 'scale-50 origin-top-left' : ''}
                  >
                    <CardComponent card={card} faceUp={true} selected={false} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
