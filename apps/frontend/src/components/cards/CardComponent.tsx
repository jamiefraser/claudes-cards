/**
 * CardComponent — single card rendering.
 * SPEC.md §15
 *
 * Artwork loads from `src/img/{standard,phase10}/` at build time via Vite.
 * Players see their own cards face-up and their opponents' cards face-down.
 */
import React, { useCallback, KeyboardEvent } from 'react';
import type { Card } from '@shared/cards';
import {
  getCardFaceUrl,
  getCardBackUrl,
  backImageNeedsLeftCrop,
  faceImageNeedsLeftCrop,
} from '@/utils/cardImage';

export interface CardComponentProps {
  card: Card;
  faceUp: boolean;
  selected: boolean;
  onClick?: () => void;
  draggable?: boolean;
  ariaLabel?: string;
}

/** Human-readable label — used as aria-label fallback and img alt. */
function getCardLabel(card: Card): string {
  if (card.deckType === 'phase10') {
    if (card.phase10Type === 'wild') return 'Wild card';
    if (card.phase10Type === 'skip') return 'Skip card';
    return `${card.phase10Color ?? ''} ${card.value}`.trim();
  }
  return `${card.rank ?? card.value} of ${card.suit ?? ''}`.trim();
}

export function CardComponent({
  card,
  faceUp,
  selected,
  onClick,
  draggable = false,
  ariaLabel,
}: CardComponentProps) {
  const label = ariaLabel ?? getCardLabel(card);

  const imageUrl = faceUp ? getCardFaceUrl(card) : getCardBackUrl(card.deckType);
  const needsLeftCrop = faceUp
    ? faceImageNeedsLeftCrop(card)
    : backImageNeedsLeftCrop(card.deckType);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick],
  );

  return (
    <button
      type="button"
      role="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      data-selected={selected}
      data-face-down={!faceUp}
      data-deck-type={card.deckType}
      data-draggable={draggable}
      className={[
        'relative inline-flex items-center justify-center overflow-hidden',
        'w-12 h-[4.5rem] sm:w-16 sm:h-24 rounded-md border-2 cursor-pointer select-none',
        'transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-400',
        selected
          ? 'border-indigo-400 -translate-y-3 shadow-lg shadow-indigo-500/40'
          : 'border-slate-600 hover:-translate-y-1',
        !faceUp ? 'bg-slate-700' : 'bg-white',
      ].join(' ')}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={faceUp ? label : 'Card face down'}
          draggable={draggable}
          className="rounded block"
          style={
            needsLeftCrop
              ? {
                  // Double-width product sheet: render at 200% so that the
                  // left half fills the container exactly.
                  width: '200%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'left center',
                }
              : {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }
          }
        />
      ) : (
        // Fallback when artwork is missing — render a labelled placeholder
        <span className="text-xs text-slate-600 px-1 text-center">{label}</span>
      )}
    </button>
  );
}
