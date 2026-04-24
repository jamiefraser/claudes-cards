/**
 * HandComponent — player's hand of cards.
 *
 * Mobile-first: cards sit in a horizontally-scrolling strip with overlap
 * (a "fan") so a 10–15 card hand never wraps to a second row at 375px.
 * Tablet+: strip widens and reveals every card; selected cards lift with
 * reserved vertical space so there's no overlap of the row above.
 *
 * Supports drag-to-reorder via @dnd-kit/sortable. Uses the ambient
 * DndContext provided by the parent (GameTable), so drops onto meld
 * groups / discard pile — siblings under the same context — reach the
 * parent's unified drag-end handler. The parent calls `onReorder`
 * (see GameTable.handleDragEnd).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '@shared/cards';
import { CardComponent } from './CardComponent';
import { useGameStore } from '@/store/gameStore';
import en from '@/i18n/en.json';

export interface HandComponentProps {
  cards: Card[];
  selectedIds: string[];
  onSelect: (cardId: string) => void;
  disabled: boolean;
  draggable?: boolean;
  /** Called with the new card-id ordering after a drag-reorder. */
  onReorder?: (orderedIds: string[]) => void;
}

interface SortableCardProps {
  card: Card;
  index: number;
  total: number;
  selected: boolean;
  justDrawn: boolean;
  /**
   * For batch deals: ordinal position of this card within the batch
   * of newly-drawn cards (0 = first to appear). Drives the deal-stagger
   * animation-delay. Null/undefined when the card isn't part of a
   * multi-card batch — single-card draws play instantly.
   */
  dealOrder: number | null;
  reorderEnabled: boolean;
  discardDraggable: boolean;
  overlapPx: number;
  onClick: () => void;
  onActivate: () => void;
}

// Per-card stagger step. Cap the effective index so a 13-card canasta
// deal finishes in ~500ms instead of stretching out to a second.
const STAGGER_STEP_MS = 45;
const STAGGER_CAP_INDEX = 5;

function SortableCard({
  card,
  index,
  total,
  selected,
  justDrawn,
  dealOrder,
  reorderEnabled,
  discardDraggable,
  overlapPx,
  onClick,
  onActivate,
}: SortableCardProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !reorderEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: reorderEnabled ? 'none' : undefined,
    // Negative left margin creates the fan overlap, but never on the
    // first card. Scroll-snap keeps the active card aligned.
    marginLeft: index === 0 ? 0 : `-${overlapPx}px`,
    // Keep the natural fan stacking even when selected — the raise is
    // purely a translateY on CardComponent. Boosting z-index on select
    // would make the raised card cover its neighbours' rank/suit corners
    // in the overlap region, which we don't want. Dragging cards still
    // get elevated via dnd-kit's internal styling.
    zIndex: 10 + index,
    // Deal stagger: cards arrive one-at-a-time in batch order. The
    // `card-slide-in` keyframe uses `both` fill mode so the pre-start
    // opacity:0 state holds during the delay window — no pop-in.
    ...(justDrawn && dealOrder != null
      ? {
          animationDelay: `${Math.min(dealOrder, STAGGER_CAP_INDEX) * STAGGER_STEP_MS}ms`,
        }
      : {}),
  };

  // Note: we deliberately do NOT spread `attributes` from useSortable here.
  // Those attributes set role="button" on the <li>, which would (a) nest a
  // role=button inside the inner <button> CardComponent (a11y violation) and
  // (b) double-count cards when tests query getAllByRole('button').
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...(reorderEnabled ? listeners : {})}
      className={[
        'list-none flex-none snap-start',
        justDrawn ? 'card-slide-in' : '',
      ].join(' ')}
    >
      <CardComponent
        card={card}
        faceUp={true}
        selected={selected}
        onClick={onClick}
        onActivate={onActivate}
        draggable={discardDraggable && !reorderEnabled}
        ariaLabel={`Card ${index + 1} of ${total}`}
      />
    </li>
  );
}

export function HandComponent({
  cards,
  selectedIds,
  onSelect,
  disabled,
  draggable = false,
  onReorder,
}: HandComponentProps) {
  const clearSelection = useGameStore(s => s.clearSelection);

  // Track newly-added card ids so we can animate them into the hand.
  // Multi-card batches (a deal) stagger their slide-in animations by
  // order-in-batch so cards appear one at a time, as if being dealt.
  // Single-card batches (a single draw) play instantly — no delay.
  const prevIdsRef = useRef<Set<string>>(new Set(cards.map(c => c.id)));
  const [justDrawn, setJustDrawn] = useState<Set<string>>(new Set());
  const [dealOrder, setDealOrder] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const currentIds = new Set(cards.map(c => c.id));
    const newIds = new Set<string>();
    // Preserve the deal order by walking `cards` (the canonical hand
    // order) rather than the Set above — Sets don't preserve insertion
    // order of the id strings across re-renders.
    const ordered: string[] = [];
    for (const card of cards) {
      if (!prevIdsRef.current.has(card.id)) {
        newIds.add(card.id);
        ordered.push(card.id);
      }
    }
    if (newIds.size > 0) {
      setJustDrawn(newIds);
      // Only populate order for multi-card batches. A single-card draw
      // gets `null` order so it plays instantly.
      if (newIds.size > 1) {
        const m = new Map<string, number>();
        ordered.forEach((id, i) => m.set(id, i));
        setDealOrder(m);
      } else {
        setDealOrder(new Map());
      }
      // Clear when the last staggered card has finished its animation.
      // 260ms animation + max-stagger delay + 60ms grace for React flush.
      const maxStagger =
        newIds.size > 1 ? Math.min(newIds.size - 1, STAGGER_CAP_INDEX) * STAGGER_STEP_MS : 0;
      const clearMs = 260 + maxStagger + 60;
      const t = setTimeout(() => {
        setJustDrawn(new Set());
        setDealOrder(new Map());
      }, clearMs);
      prevIdsRef.current = currentIds;
      return () => clearTimeout(t);
    }
    prevIdsRef.current = currentIds;
  }, [cards]);

  // Global keyboard shortcut: Escape deselects all.
  const handleGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    },
    [clearSelection],
  );
  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [handleGlobalKey]);

  const handleSelect = useCallback(
    (cardId: string) => {
      if (!disabled) onSelect(cardId);
    },
    [disabled, onSelect],
  );

  // "Activate" (Enter) is select-or-deselect — same as click, but kept
  // separate so the CardComponent can distinguish Enter from Space in
  // case we later want Enter to play instantly. For now both toggle.
  const handleActivate = useCallback(
    (cardId: string) => {
      if (!disabled) onSelect(cardId);
    },
    [disabled, onSelect],
  );

  const reorderEnabled = !!onReorder;

  // Fan overlap scales with hand size — tighter overlap for bigger hands
  // so the whole hand fits on screen without wrapping on mobile. Cards
  // always lift cleanly from a scroll-snap strip.
  //
  // DEF-006: On phone widths (<640px / Tailwind `sm`), overlap is capped
  // so each card's visible strip is >= 44px (the minimum tap target per
  // Apple/Google HIG). Card width on mobile is 48px, so max overlap is
  // 48 - 44 = 4px. The hand scrolls horizontally when it overflows.
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 640;
  const overlapPx = useMemo(() => {
    const n = Math.max(cards.length, 1);
    if (isPhone) {
      // On phone: minimal overlap to guarantee 44px tap targets.
      // Even for large hands, the scroll strip handles overflow.
      if (n <= 7)  return 2;
      return 4; // 48px card width - 4px overlap = 44px exposed per card
    }
    // Tablet+: CardComponent is 64px wide at sm+. More generous overlap.
    if (n <= 7)  return 4;
    if (n <= 10) return 14;
    if (n <= 13) return 22;
    return 28;
  }, [cards.length, isPhone]);

  const list = (
    <ul
      role="list"
      aria-label={en.table.yourHand}
      className={[
        // Horizontal scroll strip — the mobile fan.
        'no-scrollbar flex flex-row items-end',
        'overflow-x-auto overflow-y-visible overscroll-x-contain',
        // Padding-y reserves room for lift (-translate-y) without clipping.
        'pt-5 pb-3 px-6',
        // Scroll-snap keeps selection crisp.
        'snap-x snap-mandatory',
        // Centre the hand horizontally when narrow enough to fit.
        'justify-center mx-auto',
        'max-w-full',
      ].join(' ')}
    >
      {cards.map((card, index) => (
        <SortableCard
          key={card.id}
          card={card}
          index={index}
          total={cards.length}
          selected={selectedIds.includes(card.id)}
          justDrawn={justDrawn.has(card.id)}
          dealOrder={dealOrder.get(card.id) ?? null}
          reorderEnabled={reorderEnabled}
          discardDraggable={draggable}
          overlapPx={overlapPx}
          onClick={() => handleSelect(card.id)}
          onActivate={() => handleActivate(card.id)}
        />
      ))}
    </ul>
  );

  if (!reorderEnabled) return list;

  return (
    <SortableContext items={cards.map(c => c.id)} strategy={horizontalListSortingStrategy}>
      {list}
    </SortableContext>
  );
}
