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
  // Canasta jokers have neither rank nor suit — recognise them so we don't
  // render a blank "of " stub when artwork is missing.
  if (card.rank === undefined && card.suit === undefined) return 'Joker';
  if (card.suit === undefined) return `${card.rank ?? card.value}`.trim();
  return `${card.rank ?? card.value} of ${card.suit}`.trim();
}

export function CardComponent({
  card,
  faceUp,
  selected,
  onClick,
  draggable = false,
  ariaLabel,
}: CardComponentProps) {
  // `ariaLabel` from the parent describes the card's *position in a list*
  // (e.g. "Card 3 of 7"), which is the right thing for the button's
  // aria-label. But alt text on the <img> and the missing-artwork fallback
  // span must describe the card's *face value* — otherwise a card with no
  // bundled SVG (e.g. a joker) silently displays the positional stub.
  const cardLabel = getCardLabel(card);
  const label = ariaLabel ?? cardLabel;

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
        needsLeftCrop ? (
          // Phase 10 card-back / wild / skip SVGs are two-up product sheets
          // (two cards laid side-by-side in a single file). A CSS background
          // on an absolutely-positioned layer gives us clean control: scale
          // the image to 200% × 100% of the container and anchor it left, so
          // the left card occupies exactly the container and the right card
          // is pushed past the right edge (button overflow-hidden clips it).
          // The image's single-card aspect (~0.68) is close to the container
          // aspect (2:3 = 0.67), so the 200%×100% stretch is imperceptible
          // while guaranteeing no whitespace around the artwork.
          <div
            role="img"
            aria-label={faceUp ? cardLabel : 'Card face down'}
            draggable={draggable}
            className="rounded block absolute inset-0"
            style={{
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: '200% 100%',
              backgroundPosition: 'left center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        ) : (
          <img
            src={imageUrl}
            alt={faceUp ? cardLabel : 'Card face down'}
            draggable={draggable}
            className="rounded block"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )
      ) : (
        // Fallback when artwork is missing — render the actual card face name,
        // never the positional aria-label (would read as "Card 19 of 19" for
        // a joker whose SVG isn't bundled).
        <span className="text-xs text-slate-600 px-1 text-center">{cardLabel}</span>
      )}
    </button>
  );
}
