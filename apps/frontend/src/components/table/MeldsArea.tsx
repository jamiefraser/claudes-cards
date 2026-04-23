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
  /** Canasta metadata. Optional because Phase 10 / Rummy don't use it. */
  isCanasta?: boolean;
  /** 'natural' = 7+ cards all naturals (500 bonus); 'mixed' = includes a wild (300 bonus). */
  canastaType?: 'natural' | 'mixed';
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

/**
 * Collapsed canasta pile. Once a meld becomes a canasta (7+ cards), we
 * stop fanning every card and render a compact 3-card "shingle" plus a
 * NATURAL / MIXED ribbon. The colour split deliberately mirrors the
 * scoring bonus — ochre for natural (500 pts), burgundy for mixed
 * (300 pts) — so an opponent can read the table's value from across
 * the room.
 */
function CanastaPile({
  cards,
  canastaType,
  scaleFactor,
}: {
  cards: Card[];
  canastaType: 'natural' | 'mixed';
  scaleFactor: number;
}) {
  const cardW = 3 * scaleFactor; // rem
  const cardH = 4.5 * scaleFactor; // rem
  // The first card in the meld's cardIds order is a natural of the rank
  // (canasta invariant: at least 2 naturals). Render it face-up on top.
  const topCard = cards[0];
  if (!topCard) return null;

  const isNatural = canastaType === 'natural';
  const ribbon = isNatural ? 'Natural' : 'Mixed';
  const ribbonClasses = isNatural
    ? 'bg-ochre text-accent-fg border-ochre-hi'
    : 'bg-burgundy text-white border-burgundy';

  return (
    <div
      className="flex flex-col items-center gap-1"
      aria-label={`${ribbon} canasta of ${cards.length} cards`}
    >
      {/* Scoring-value ribbon — the whole point of collapsing is that
          the badge, not the card fan, is the visual focus. */}
      <span
        className={[
          'px-2 py-0.5 rounded-full border font-display uppercase tracking-[0.14em]',
          'text-[0.6rem] leading-none shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
          ribbonClasses,
        ].join(' ')}
      >
        {ribbon} · {cards.length}
      </span>
      {/* Shingle: three layered card faces with a slight rotation so
          the pile reads as "a stack" rather than "one card". The top
          card is the most-rotated, catching the eye. */}
      <div
        className="relative"
        style={{
          width: `calc(${cardW}rem + 8px)`,
          height: `calc(${cardH}rem + 8px)`,
        }}
      >
        {[
          { rot: '-6deg', offset: '-4px', z: 1 },
          { rot: '0deg', offset: '0px', z: 2 },
          { rot: '5deg', offset: '4px', z: 3 },
        ].map((slot, i) => (
          <div
            key={i}
            className="absolute top-0 left-0"
            style={{
              width: `${cardW}rem`,
              height: `${cardH}rem`,
              transform: `translateX(${slot.offset}) rotate(${slot.rot})`,
              transformOrigin: 'center center',
              zIndex: slot.z,
            }}
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
              <CardComponent card={topCard} faceUp={true} selected={false} />
            </div>
          </div>
        ))}
      </div>
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
  // DEF-004: medium scale was 0.75, making in-felt bot melds unreadable at
  // desktop sizes. Now renders at full size — the container's flex layout
  // handles the space naturally. Tiny and compact remain scaled for mobile
  // and condensed contexts.
  const scaleFactor =
    scale === 'tiny' ? 0.33
    : scale === 'compact' ? 0.5
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
          // Canasta (7+ cards): render a COLLAPSED pile. Fanning 7-12
          // cards horizontally takes too much room and a completed
          // canasta is effectively a single scoring unit — the badge
          // shows natural/mixed status, which is all the opponent needs
          // to read at a glance.
          const body = group.isCanasta ? (
            <CanastaPile
              cards={cards}
              canastaType={group.canastaType ?? 'natural'}
              scaleFactor={scaleFactor}
            />
          ) : (
            <div
              className="flex flex-col items-center"
              aria-label={`${group.type} of ${cards.length}`}
            >
              <GroupTypeBadge type={group.type} />
              {/* flex-nowrap: every card in one meld must stay on the
                  same row (the engine treats them as a single group; if
                  they wrap visually the UI suggests they're two
                  separate melds, which they aren't). The outer `groups`
                  container already wraps BETWEEN melds when the row
                  overflows, which is the correct break-point. */}
              <div className={`flex flex-row flex-nowrap ${overlapClass}`}>
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
                              transformOrigin: 'center',
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
