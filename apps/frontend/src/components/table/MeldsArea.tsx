/**
 * MeldsArea — renders a player's laid-down phase groups face-up.
 * Used below each player's seat (including the local player) once they
 * have completed their phase.
 */
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
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
  /**
   * Layout scale. `full` matches the player's own hand cards, `medium` shrinks
   * to 75% (opponent melds — legible without crowding the seat), `compact`
   * to 50%, `tiny` to 33%. Used for opponents in the rummy family so their
   * melds never dominate the seat.
   */
  scale?: 'full' | 'medium' | 'compact' | 'tiny';
  /**
   * When set, each group is wrapped in a @dnd-kit droppable with id
   * `meld:{dropTargetPlayerId}:{groupIndex}` so the parent DndContext can
   * distinguish drops onto specific melds (used by Phase 10's hit-meld flow).
   */
  dropTargetPlayerId?: string;
}

function GroupDropZone({
  dropId,
  active,
  children,
}: {
  dropId: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: dropId, disabled: !active });
  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-md transition-colors',
        active ? 'ring-1 ring-transparent' : '',
        isOver ? 'bg-brass/20 ring-brass/60' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
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
  scale = 'full',
  dropTargetPlayerId,
}: MeldsAreaProps) {
  if (groups.length === 0) return null;

  const isTiny = scale === 'tiny';
  const isCompact = scale === 'compact';
  const isMedium = scale === 'medium';
  // CardComponent renders itself at a fixed 48×72 (sm: 64×96), so to shrink
  // we scale visually via CSS transform AND clamp the wrapper's layout box to
  // the target size. Without the explicit wrapper size the scaled card still
  // reserves its full 48×72, producing comically large gaps between melds.
  const scaleFactor =
    scale === 'tiny' ? 0.33
    : scale === 'compact' ? 0.5
    : scale === 'medium' ? 0.75
    : 1;
  // Negative space-x values overlap each card on top of its left neighbour.
  // We keep the overlap modest enough that the top-left rank+suit glyph of
  // every card stays visible — without that, a long meld (especially after
  // multiple hits) reads as one big card rather than 5/6/7 individual cards.
  // Tuned per scale: more overlap is acceptable when the cards are tiny
  // because the corner glyph is a smaller fraction of the card's width.
  const overlapClass =
    scale === 'tiny'
      ? '-space-x-1'
      : scale === 'compact'
        ? '-space-x-2'
        : scale === 'medium'
          ? '-space-x-2.5'
          : '-space-x-3';

  return (
    <div
      className={[
        'flex flex-col items-center gap-1 p-2 rounded-md',
        'bg-slate-800/60 border border-slate-700',
        isTiny || isCompact || isMedium ? 'text-xs' : 'text-sm',
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
          const body = (
            <div
              className="flex flex-col items-center"
              aria-label={`${group.type} of ${cards.length}`}
            >
              <GroupTypeBadge type={group.type} />
              {/* flex-wrap so a long meld (e.g. phase 8 of 7+ cards after a
                  few hits) wraps to a second row instead of overflowing
                  the seat horizontally. */}
              <div className={`flex flex-row flex-wrap ${overlapClass}`}>
                {cards.map(card => (
                  <div
                    key={card.id}
                    style={
                      scaleFactor < 1
                        ? {
                            width: `calc(3rem * ${scaleFactor})`,
                            height: `calc(4.5rem * ${scaleFactor})`,
                          }
                        : undefined
                    }
                  >
                    <div
                      style={
                        scaleFactor < 1
                          ? {
                              transform: `scale(${scaleFactor})`,
                              transformOrigin: 'top left',
                            }
                          : undefined
                      }
                    >
                      <CardComponent card={card} faceUp={true} selected={false} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
          if (dropTargetPlayerId) {
            return (
              <GroupDropZone
                key={gi}
                dropId={`meld:${dropTargetPlayerId}:${gi}`}
                active={true}
              >
                {body}
              </GroupDropZone>
            );
          }
          return <React.Fragment key={gi}>{body}</React.Fragment>;
        })}
      </div>
    </div>
  );
}
