/**
 * HandComponent — player's hand of cards, horizontal fan layout.
 * SPEC.md §15
 *
 * Supports drag-to-reorder via @dnd-kit/sortable. The parent owns the order
 * (so it can be persisted across deals); we just emit the new sequence via
 * `onReorder` after a successful drag.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
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
  onClick: () => void;
}

function SortableCard({
  card,
  index,
  total,
  selected,
  justDrawn,
  reorderEnabled,
  discardDraggable,
  onClick,
}: SortableCardProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !reorderEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: reorderEnabled ? 'none' : undefined,
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
      className={`list-none ${justDrawn ? 'card-slide-in' : ''}`}
    >
      <CardComponent
        card={card}
        faceUp={true}
        selected={selected}
        onClick={onClick}
        // Discard-pile drag (the original mechanic) only when reorder is off
        // so the two drag systems don't collide.
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

  // Track newly-added card ids so we can animate them sliding into the hand.
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

  // Keyboard shortcut: Escape deselects all
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    },
    [clearSelection],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSelect = useCallback(
    (cardId: string) => {
      if (!disabled) {
        onSelect(cardId);
      }
    },
    [disabled, onSelect],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderEnabled = !!onReorder;

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      if (!onReorder) return;
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = cards.map(c => c.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder(arrayMove(ids, oldIndex, newIndex));
    },
    [cards, onReorder],
  );

  const list = (
    <ul
      role="list"
      aria-label={en.table.yourHand}
      className="flex flex-row items-end gap-1 flex-wrap justify-center px-2 py-4 max-w-full"
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
          onClick={() => handleSelect(card.id)}
        />
      ))}
    </ul>
  );

  if (!reorderEnabled) return list;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={cards.map(c => c.id)} strategy={horizontalListSortingStrategy}>
        {list}
      </SortableContext>
    </DndContext>
  );
}
