/**
 * PileComponent — draw pile or discard pile.
 * SPEC.md §15
 */
import React from 'react';
import type { Card, DeckType } from '@shared/cards';
import {
  getCardBackUrl,
  getCardFaceUrl,
  backImageNeedsLeftCrop,
  faceImageNeedsLeftCrop,
} from '@/utils/cardImage';
import en from '@/i18n/en.json';

export interface PileComponentProps {
  /** For draw pile: total count of cards remaining */
  cardCount?: number;
  /** For discard pile: the top-visible card */
  topCard?: Card | null;
  type: 'draw' | 'discard';
  onClick?: () => void;
  /** Whether this pile is a drop target (discard) */
  isDropTarget?: boolean;
  /** Deck type controls which card-back art the draw pile shows. */
  deckType?: DeckType;
  /** For discard pile: total count of cards in the pile (DEF-007). */
  discardPileCount?: number;
  /** For discard pile: whether the pile is currently frozen (DEF-013). */
  isFrozen?: boolean;
  /**
   * For discard pile: the wild / red-3 card that froze the pile, if any.
   * When present we render it tilted 45° peeking out of the stack so the
   * frozen state is legible without the old lock icon. The card stays
   * visible even after subsequent non-wild cards are discarded on top —
   * see canasta engine `discardFrozenBy`.
   */
  frozenByCard?: Card | null;
}

// Rotation used for the wild card that froze the pile. Kept as a constant
// so design can tune it without hunting the file.
const FROZEN_CARD_ROTATION_DEG = 45;

export function PileComponent({
  cardCount,
  topCard,
  type,
  onClick,
  isDropTarget = false,
  deckType = 'standard',
  discardPileCount,
  isFrozen = false,
  frozenByCard,
}: PileComponentProps) {
  if (type === 'draw') {
    const backUrl = getCardBackUrl(deckType);
    const needsCrop = backImageNeedsLeftCrop(deckType);
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Draw pile — ${cardCount ?? 0} cards remaining`}
        className={[
          'relative w-16 h-24 rounded-md border-2 cursor-pointer overflow-hidden',
          'flex items-center justify-center',
          'bg-paper-deep border-hairline/80',
          'hover:border-ochre transition-[border-color,box-shadow]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        ].join(' ')}
      >
        {backUrl && (
          // Image is decorative — the button already carries the count via
          // aria-label. Empty alt avoids screen-reader double-read.
          <img
            src={backUrl}
            alt=""
            width={64}
            height={96}
            className="rounded block w-full h-full"
            style={
              needsCrop
                ? {
                    width: '200%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'left center',
                  }
                : { objectFit: 'cover' }
            }
          />
        )}
        {cardCount !== undefined && (
          // Pile count badge — top-left to match the discard pile's
          // repositioned count (see below).
          <span className="absolute top-1 left-1 bg-ink/80 text-paper text-xs rounded px-1 font-mono tabular-nums">
            {cardCount}
          </span>
        )}
      </button>
    );
  }

  // Discard pile
  const faceUrl = topCard ? getCardFaceUrl(topCard) : null;
  const discardNeedsCrop = topCard ? faceImageNeedsLeftCrop(topCard) : false;
  const topIsFrozenBy =
    !!frozenByCard && !!topCard && frozenByCard.id === topCard.id;
  const frozenCardUrl = frozenByCard ? getCardFaceUrl(frozenByCard) : null;
  const frozenCardNeedsCrop = frozenByCard
    ? faceImageNeedsLeftCrop(frozenByCard)
    : false;

  return (
    <div
      className="relative w-16 h-24"
      // overflow-visible lets the rotated frozen card peek past the
      // pile's rectangular footprint. Parent layouts reserve gutter
      // space for this in StockDiscardArea.
      style={{ overflow: 'visible' }}
    >
      {/* Frozen-by peek — rendered BEHIND the top when the top is some
          other card discarded after the freeze. When the top IS the
          freezing card (just discarded), we skip the peek and rotate
          the main button instead (see below) so the wild isn't drawn
          twice. */}
      {frozenByCard && frozenCardUrl && !topIsFrozenBy && (
        <div
          aria-hidden
          className="absolute w-16 h-24 rounded-md border border-hairline/60 shadow-paper overflow-hidden pointer-events-none bg-[#ffffff]"
          style={{
            // Translate first (shifts down-and-right so most of the peek
            // extends past the top card's bottom-right corner), then
            // rotate. z-index 12 puts the jutting corner over the top
            // card so it clearly reads as "on the pile" — but the large
            // translate keeps it out of the top-left rank/suit reading
            // corner.
            transform: `translate(32px, 24px) rotate(${FROZEN_CARD_ROTATION_DEG}deg)`,
            zIndex: 12,
          }}
        >
          <img
            src={frozenCardUrl}
            alt=""
            width={64}
            height={96}
            className="rounded block w-full h-full"
            style={
              frozenCardNeedsCrop
                ? { objectFit: 'cover', objectPosition: 'left center' }
                : { objectFit: 'cover' }
            }
          />
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={topCard ? `Discard pile${discardPileCount != null ? ` — ${discardPileCount} cards` : ''}${isFrozen ? ' (frozen)' : ''}` : 'Empty discard pile'}
        aria-dropeffect={isDropTarget ? 'move' : 'none'}
        className={[
          'absolute inset-0 rounded-md border-2 cursor-pointer overflow-hidden',
          'flex items-center justify-center',
          isDropTarget ? 'border-sage ring-2 ring-sage/40' : 'border-hairline',
          !topCard ? 'bg-paper-deep border-dashed' : 'bg-[#ffffff]',
          'transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        ].join(' ')}
        style={
          // When the top card IS the freezing wild (just discarded), rotate
          // the whole button so the wild sits on the pile at 45°. If a
          // non-wild is later discarded on top, the button stays upright
          // and the peek element above supplies the tilted wild.
          topIsFrozenBy
            ? { transform: `rotate(${FROZEN_CARD_ROTATION_DEG}deg)`, zIndex: 10 }
            : { zIndex: 10 }
        }
      >
        {topCard && faceUrl ? (
          <img
            src={faceUrl}
            alt=""
            width={64}
            height={96}
            className="rounded block w-full h-full"
            style={
              discardNeedsCrop
                ? { objectFit: 'cover', objectPosition: 'left center' }
                : { objectFit: 'cover' }
            }
          />
        ) : (
          <span className="text-whisper text-xs text-center px-1 font-mono">
            {topCard ? '' : en.app.loading}
          </span>
        )}
        {/* DEF-007: Discard pile count — moved to the top-left corner so
            it reads on the opposite side from the previous bottom-right
            position (avoids collision with the rotated frozen card
            peeking out to the right). */}
        {discardPileCount != null && (
          <span className="absolute top-1 left-1 bg-ink/80 text-paper text-xs rounded px-1 font-mono tabular-nums">
            {discardPileCount}
          </span>
        )}
      </button>
    </div>
  );
}
