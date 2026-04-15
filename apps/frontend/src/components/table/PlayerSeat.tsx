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
  deckType?: DeckType;
  isDealer?: boolean;
}

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
          className="w-5 h-7 rounded-sm border border-brass/30 bg-night overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          style={{ marginLeft: i === 0 ? 0 : '-10px', zIndex: i }}
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
        'relative flex flex-col items-center gap-1 px-3 py-2.5 min-w-[110px]',
        'rounded-2xl backdrop-blur',
        'bg-night-raised/85',
        'border transition-colors',
        isCurrentTurn
          ? 'border-brand-secondary/70 animate-turn-pulse'
          : 'border-brass/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_18px_-10px_rgba(0,0,0,0.7)]',
      ].join(' ')}
      aria-label={`${playerState.displayName}'s seat${isDealer ? ' (dealer)' : ''}`}
    >
      {isDealer && (
        <span
          className={[
            'absolute -top-2.5 -left-2.5 z-10 w-7 h-7 rounded-full',
            'flex items-center justify-center',
            'font-display font-bold text-[0.72rem]',
            'bg-gradient-to-b from-brass-bright to-brass-dim text-night',
            'border border-brass-dim shadow-[0_2px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]',
          ].join(' ')}
          title={en.table.dealerBadgeTooltip}
          aria-label={en.table.dealerBadgeTooltip}
        >
          {en.table.dealerBadge}
        </span>
      )}

      <div
        className={[
          'w-10 h-10 rounded-full flex items-center justify-center',
          'font-display font-bold text-base',
          'bg-gradient-to-br from-brand-primary/70 to-brand-secondary/60',
          'text-parchment border border-brass/30',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
        ].join(' ')}
      >
        {playerState.displayName.charAt(0).toUpperCase()}
      </div>

      <span className="font-display text-sm text-parchment truncate max-w-[100px] leading-tight">
        {playerState.displayName}
        {isSelf && (
          <span className="ml-1 text-parchment/45 text-[0.65rem] tracking-wider uppercase">
            (you)
          </span>
        )}
      </span>

      {!isSelf && (
        <>
          <span className="text-parchment/55 text-[0.7rem] tracking-wide">
            {en.table.cardCount.replace('{count}', String(playerState.hand.length))}
          </span>
          <OpponentHandVisual
            handSize={playerState.hand.length}
            deckType={deckType}
          />
        </>
      )}

      <span className="flex items-baseline gap-1.5 font-display text-sm">
        <span className="text-brass-bright tabular-nums">{playerState.score}</span>
        <span className="text-parchment/40 text-[0.65rem] uppercase tracking-widest">pts</span>
      </span>

      <span aria-live="polite" className="min-h-[1em]">
        {isCurrentTurn && (
          <span className="font-display italic text-[0.72rem] text-brand-secondary">
            {isSelf ? en.table.yourTurn : en.table.thinking}
          </span>
        )}
      </span>
    </div>
  );
}
