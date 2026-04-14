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
          'bg-slate-700 border-slate-600',
          'hover:border-indigo-400 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-indigo-400',
        ].join(' ')}
      >
        {backUrl && (
          <img
            src={backUrl}
            alt="Draw pile"
            className="rounded block"
            style={
              needsCrop
                ? {
                    width: '200%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'left center',
                  }
                : { width: '100%', height: '100%', objectFit: 'cover' }
            }
          />
        )}
        {cardCount !== undefined && (
          <span className="absolute bottom-1 right-1 bg-slate-800/80 text-white text-xs rounded px-1">
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
      aria-label={topCard ? 'Top of pile' : 'Empty pile'}
      aria-dropeffect={isDropTarget ? 'move' : 'none'}
      className={[
        'relative w-16 h-24 rounded-md border-2 cursor-pointer overflow-hidden',
        'flex items-center justify-center',
        isDropTarget
          ? 'border-green-400 ring-2 ring-green-400/50'
          : 'border-slate-500',
        !topCard ? 'bg-slate-800 border-dashed' : 'bg-white',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400',
      ].join(' ')}
    >
      {topCard && faceUrl ? (
        <img
          src={faceUrl}
          alt="Top of pile"
          className="rounded block"
          style={
            discardNeedsCrop
              ? { objectFit: 'cover', objectPosition: 'left center' }
              : { objectFit: 'cover' }
          }
        />
      ) : (
        <span className="text-slate-600 text-xs text-center px-1">
          {topCard ? '' : en.app.loading}
        </span>
      )}
    </button>
  );
}
