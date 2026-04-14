/**
 * PlayerSeat — human player seat at the table.
 * SPEC.md §15
 */
import React from 'react';
import type { PlayerState } from '@shared/gameState';
import { getCardBackUrl, backImageNeedsLeftCrop } from '@/utils/cardImage';
import type { DeckType } from '@shared/cards';
import en from '@/i18n/en.json';

export interface PlayerSeatProps {
  playerState: PlayerState;
  isCurrentTurn: boolean;
  isSelf: boolean;
  /** Deck type for opponent card-back rendering. Defaults to 'standard'. */
  deckType?: DeckType;
  /** Show the dealer badge on this seat (games with a dealer concept). */
  isDealer?: boolean;
}

/**
 * A small fan of face-down cards shown next to an opponent's seat so the
 * player can see how many cards they hold and that they're hidden.
 * Caps at 7 visible cards; additional cards are indicated by the count badge.
 */
function OpponentHandVisual({
  handSize,
  deckType,
}: {
  handSize: number;
  deckType: DeckType;
}) {
  const backUrl = getCardBackUrl(deckType);
  const needsCrop = backImageNeedsLeftCrop(deckType);
  const visible = Math.min(handSize, 7);
  if (visible <= 0) return null;

  return (
    <div
      className="flex items-center justify-center mt-1"
      aria-label={`${handSize} cards face down`}
      role="img"
    >
      {Array.from({ length: visible }).map((_, i) => (
        <div
          key={i}
          className="w-5 h-7 rounded-sm border border-slate-500 bg-slate-900 overflow-hidden"
          style={{
            marginLeft: i === 0 ? 0 : '-10px',
            zIndex: i,
          }}
        >
          {backUrl && (
            <img
              src={backUrl}
              alt=""
              aria-hidden="true"
              className="block"
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
        </div>
      ))}
    </div>
  );
}

export function PlayerSeat({
  playerState,
  isCurrentTurn,
  isSelf,
  deckType = 'standard',
  isDealer = false,
}: PlayerSeatProps) {
  return (
    <div
      className={[
        'relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 min-w-[80px]',
        isCurrentTurn
          ? 'border-indigo-400 shadow-lg shadow-indigo-500/30'
          : 'border-slate-600',
        isSelf ? 'bg-slate-700' : 'bg-slate-800',
      ].join(' ')}
      aria-label={`${playerState.displayName}'s seat${isDealer ? ' (dealer)' : ''}`}
    >
      {/* Dealer badge — top-left */}
      {isDealer && (
        <span
          className="absolute -top-2 -left-2 bg-amber-500 text-slate-900 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-800 z-10"
          title={en.table.dealerBadgeTooltip}
          aria-label={en.table.dealerBadgeTooltip}
        >
          {en.table.dealerBadge}
        </span>
      )}

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-bold text-sm">
        {playerState.displayName.charAt(0).toUpperCase()}
      </div>

      {/* Name */}
      <span className="text-white text-xs font-medium truncate max-w-[72px]">
        {playerState.displayName}
        {isSelf && (
          <span className="ml-1 text-indigo-400 text-xs">(You)</span>
        )}
      </span>

      {/* Card count + face-down fan (for others) */}
      {!isSelf && (
        <>
          <span className="text-slate-400 text-xs">
            {en.table.cardCount.replace('{count}', String(playerState.hand.length))}
          </span>
          <OpponentHandVisual
            handSize={playerState.hand.length}
            deckType={deckType}
          />
        </>
      )}

      {/* Score */}
      <span className="text-slate-300 text-xs">
        {playerState.score} pts
      </span>

      {/* Thinking indicator */}
      <span aria-live="polite">
        {isCurrentTurn && (
          <span className="text-yellow-400 text-xs animate-pulse">
            {isSelf ? en.table.yourTurn : en.table.thinking}
          </span>
        )}
      </span>
    </div>
  );
}
