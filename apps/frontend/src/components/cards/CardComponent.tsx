/**
 * CardComponent — single card rendering.
 * SPEC.md §15
 *
 * Artwork loads from `src/img/{standard,phase10}/` at build time via Vite.
 * Players see their own cards face-up and their opponents' cards face-down.
 *
 * Sized to meet the 44×44 minimum tap target on mobile (48×72 is borderline
 * but widened by the fan gap in HandComponent). Selection lifts by
 * translateY(-10px) and is backed by a 1px ochre hairline — the
 * Le Salon signature — rather than a heavy glow.
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
  /**
   * Optional Enter/Space handler. Defaults to `onClick` — pass if the
   * caller wants to differentiate "click" from "keyboard activate".
   */
  onActivate?: () => void;
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
  if (card.rank === undefined && card.suit === undefined) return 'Joker';
  if (card.suit === undefined) return `${card.rank ?? card.value}`.trim();
  return `${card.rank ?? card.value} of ${card.suit}`.trim();
}

export function CardComponent({
  card,
  faceUp,
  selected,
  onClick,
  onActivate,
  draggable = false,
  ariaLabel,
}: CardComponentProps) {
  // `ariaLabel` from the parent describes the card's *position in a list*
  // (e.g. "Card 3 of 7"). Alt text on the <img> and the missing-artwork
  // span instead describe the card's *face value* — otherwise a card with
  // no bundled SVG (e.g. a joker) silently displays the positional stub.
  const cardLabel = getCardLabel(card);
  const label = ariaLabel ?? cardLabel;

  const imageUrl = faceUp ? getCardFaceUrl(card) : getCardBackUrl(card.deckType);
  const needsLeftCrop = faceUp
    ? faceImageNeedsLeftCrop(card)
    : backImageNeedsLeftCrop(card.deckType);

  const activate = onActivate ?? onClick;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        activate?.();
      }
    },
    [activate],
  );

  return (
    <button
      type="button"
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
        // Tap target: ≥44 width / ≥66 tall. sm+ scales to 64×96.
        'w-12 min-w-[48px] h-[4.5rem] sm:w-16 sm:h-24',
        'rounded-md border cursor-pointer select-none',
        'transition-[transform,box-shadow,border-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        selected
          ? 'border-ochre -translate-y-[10px] shadow-lift origin-bottom'
          : 'border-hairline/80 hover:-translate-y-[4px] hover:shadow-lift hover:border-ochre/60 hover:z-[31]',
        !faceUp ? 'bg-[#1f2530]' : 'bg-[#ffffff]',
      ].join(' ')}
    >
      {imageUrl ? (
        needsLeftCrop ? (
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
            width={64}
            height={96}
            className="rounded block w-full h-full"
            style={{ objectFit: 'cover' }}
          />
        )
      ) : (
        // Fallback when artwork is missing — render the actual card face
        // name, never the positional aria-label (would read as
        // "Card 19 of 19" for a joker whose SVG isn't bundled).
        <span className="text-xs text-whisper px-1 text-center font-mono">{cardLabel}</span>
      )}

      {/* Le Salon selection-mark: a 1px ochre hairline beneath the card. */}
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 right-1 -bottom-[6px] h-px bg-ochre animate-rule-sweep"
        />
      )}
    </button>
  );
}
