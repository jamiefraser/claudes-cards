/**
 * BotSeat — bot-controlled seat at the table.
 * SPEC.md §9.6, §15
 */
import React from 'react';
import type { PlayerState } from '@shared/gameState';
import type { DeckType } from '@shared/cards';
import { getCardBackUrl, backImageNeedsLeftCrop } from '@/utils/cardImage';
import en from '@/i18n/en.json';

export interface BotSeatProps {
  playerState: PlayerState;
  originalDisplayName: string;
  isCurrentTurn: boolean;
  deckType?: DeckType;
  isDealer?: boolean;
  /** Mirror PlayerSeat.compact — 33% opponent card-back sizing for rummy. */
  compact?: boolean;
}

function RobotIcon() {
  return (
    <svg
      data-bot-avatar="true"
      width="40"
      height="40"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-bot drop-shadow-[0_2px_6px_rgba(168,85,247,0.35)]"
    >
      <rect x="8" y="10" width="24" height="20" rx="3" fill="currentColor" />
      <circle cx="15" cy="18" r="3" fill="#1e1b4b" />
      <circle cx="25" cy="18" r="3" fill="#1e1b4b" />
      <circle cx="16" cy="17" r="1" fill="#a5b4fc" />
      <circle cx="26" cy="17" r="1" fill="#a5b4fc" />
      <rect x="13" y="24" width="14" height="2" rx="1" fill="#1e1b4b" />
      <rect x="15" y="24" width="2" height="2" rx="0.5" fill="#a5b4fc" />
      <rect x="19" y="24" width="2" height="2" rx="0.5" fill="#a5b4fc" />
      <rect x="23" y="24" width="2" height="2" rx="0.5" fill="#a5b4fc" />
      <line x1="20" y1="10" x2="20" y2="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="4" r="2" fill="currentColor" />
      <line x1="8" y1="18" x2="4" y2="18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="3" cy="18" r="1.5" fill="currentColor" />
      <line x1="32" y1="18" x2="36" y2="18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="37" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function BotSeat({
  playerState,
  originalDisplayName,
  isCurrentTurn,
  deckType = 'standard',
  isDealer = false,
  compact = false,
}: BotSeatProps) {
  const tooltipText = en.table.botTooltip.replace('{name}', originalDisplayName);
  const backUrl = getCardBackUrl(deckType);
  const needsCrop = backImageNeedsLeftCrop(deckType);
  const visibleCards = Math.min(playerState.hand.length, 7);
  const cardBackSizeClass = compact ? 'w-4 h-6' : 'w-5 h-7';
  const cardBackOverlap = compact ? '-8px' : '-10px';

  return (
    <div
      className={[
        'relative flex flex-col items-center gap-1 px-3 py-2.5 min-w-[110px]',
        'rounded-2xl backdrop-blur',
        'bg-night-raised/85',
        'border transition-colors',
        isCurrentTurn
          ? 'border-bot/70 shadow-[0_0_0_1px_rgba(168,85,247,0.5),0_0_28px_2px_rgba(168,85,247,0.35)]'
          : 'border-bot/30',
      ].join(' ')}
      aria-label={`${originalDisplayName} (Bot) seat${isDealer ? ' (dealer)' : ''}`}
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

      <span
        className={[
          'absolute -top-2 -right-2 z-10 px-2 py-0.5 rounded-full',
          'font-display text-[0.6rem] tracking-[0.18em] uppercase font-bold',
          'bg-bot/95 text-white',
          'border border-bot/60 shadow-[0_2px_6px_rgba(168,85,247,0.4)]',
          'cursor-help',
        ].join(' ')}
        title={tooltipText}
      >
        {en.table.botBadge}
      </span>

      <RobotIcon />

      <span className="font-display text-sm text-parchment truncate max-w-[100px] leading-tight">
        {originalDisplayName}
        <span className="ml-1 text-bot/80 text-[0.65rem] tracking-wider uppercase">
          {en.table.botNameSuffix}
        </span>
      </span>

      <span className="text-parchment/55 text-[0.7rem] tracking-wide">
        {en.table.cardCount.replace('{count}', String(playerState.hand.length))}
      </span>

      {visibleCards > 0 && (
        <div
          className="flex items-center justify-center mt-1"
          aria-label={`${playerState.hand.length} cards face down`}
          role="img"
        >
          {Array.from({ length: visibleCards }).map((_, i) => (
            <div
              key={i}
              className={`${cardBackSizeClass} rounded-sm border border-brass/30 bg-night overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.5)]`}
              style={{ marginLeft: i === 0 ? 0 : cardBackOverlap, zIndex: i }}
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
      )}

      <span className="flex items-baseline gap-1.5 font-display text-sm">
        <span className="text-brass-bright tabular-nums">{playerState.score}</span>
        <span className="text-parchment/40 text-[0.65rem] uppercase tracking-widest">pts</span>
      </span>

      {isCurrentTurn && (
        <span className="font-display italic text-[0.72rem] text-bot animate-pulse">
          {en.table.thinking}
        </span>
      )}
    </div>
  );
}
