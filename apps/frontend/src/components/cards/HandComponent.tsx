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
  reorderEnabled: boolean;
  discardDraggable: boolean;
  overlapPx: number;
  onClick: () => void;
  onActivate: () => void;
}

function SortableCard({
  card,
  index,
  total,
  selected,
  justDrawn,
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
    zIndex: selected ? 30 : 10 + index,
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
  const prevIdsRef = useRef<Set<string>>(new Set(cards.map(c => c.id)));
  const [justDrawn, setJustDrawn] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(cards.map(c => c.id));
    const newIds = new Set<string>();
    currentIds.forEach(id => {
      if (!prevIdsRef.current.has(id)) newIds.add(id);
    });
    if (newIds.size > 0) {
      setJustDrawn(newIds);
      const t = setTimeout(() => setJustDrawn(new Set()), 450);
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
  const overlapPx = useMemo(() => {
    // CardComponent width: 48px (mobile), 64px (sm+). We overlap up to
    // ~45% of the width so hands of 15 cards still strap within ~420px
    // total (fits 375px viewport comfortably).
    const n = Math.max(cards.length, 1);
    if (n <= 7)  return 4;        // no overlap, just a gap
    if (n <= 10) return 14;
    if (n <= 13) return 22;
    return 28;
  }, [cards.length]);

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
