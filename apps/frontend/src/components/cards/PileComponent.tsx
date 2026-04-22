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
}

export function PileComponent({
  cardCount,
  topCard,
  type,
  onClick,
  isDropTarget = false,
  deckType = 'standard',
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
          <span className="absolute bottom-1 right-1 bg-ink/80 text-paper text-xs rounded px-1 font-mono tabular-nums">
            {cardCount}
          </span>
        )}
      </button>
    );
  }

  // Discard pile
  const faceUrl = topCard ? getCardFaceUrl(topCard) : null;
  const discardNeedsCrop = topCard ? faceImageNeedsLeftCrop(topCard) : false;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={topCard ? 'Discard pile' : 'Empty discard pile'}
      aria-dropeffect={isDropTarget ? 'move' : 'none'}
      className={[
        'relative w-16 h-24 rounded-md border-2 cursor-pointer overflow-hidden',
        'flex items-center justify-center',
        isDropTarget
          ? 'border-sage ring-2 ring-sage/40'
          : 'border-hairline',
        !topCard ? 'bg-paper-deep border-dashed' : 'bg-[#ffffff]',
        'transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
      ].join(' ')}
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
    </button>
  );
}
