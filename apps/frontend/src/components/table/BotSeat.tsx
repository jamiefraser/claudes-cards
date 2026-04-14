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
  /** The original human player's display name */
  originalDisplayName: string;
  isCurrentTurn: boolean;
  deckType?: DeckType;
  /** Show the dealer badge (cribbage etc.). */
  isDealer?: boolean;
}

/**
 * Robot icon SVG — circuit-board face motif.
 * Original design, inline SVG per SPEC.md §9.6.
 */
function RobotIcon() {
  return (
    <svg
      data-bot-avatar="true"
      width="40"
      height="40"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-purple-400"
    >
      {/* Head */}
      <rect x="8" y="10" width="24" height="20" rx="3" fill="currentColor" />
      {/* Eyes */}
      <circle cx="15" cy="18" r="3" fill="#1e1b4b" />
      <circle cx="25" cy="18" r="3" fill="#1e1b4b" />
      {/* Eye lights */}
      <circle cx="16" cy="17" r="1" fill="#a5b4fc" />
      <circle cx="26" cy="17" r="1" fill="#a5b4fc" />
      {/* Mouth */}
      <rect x="13" y="24" width="14" height="2" rx="1" fill="#1e1b4b" />
      {/* Mouth segments */}
      <rect x="15" y="24" width="2" height="2" rx="0.5" fill="#a5b4fc" />
      <rect x="19" y="24" width="2" height="2" rx="0.5" fill="#a5b4fc" />
      <rect x="23" y="24" width="2" height="2" rx="0.5" fill="#a5b4fc" />
      {/* Antenna */}
      <line x1="20" y1="10" x2="20" y2="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="4" r="2" fill="currentColor" />
      {/* Circuit traces */}
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
}: BotSeatProps) {
  const tooltipText = en.table.botTooltip.replace('{name}', originalDisplayName);
  const backUrl = getCardBackUrl(deckType);
  const needsCrop = backImageNeedsLeftCrop(deckType);
  const visibleCards = Math.min(playerState.hand.length, 7);

  return (
    <div
      className={[
        'relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 min-w-[80px]',
        isCurrentTurn
          ? 'border-purple-400 shadow-lg shadow-purple-500/30'
          : 'border-purple-700',
        'bg-slate-800',
      ].join(' ')}
      aria-label={`${originalDisplayName} (Bot) seat${isDealer ? ' (dealer)' : ''}`}
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

      {/* BOT badge — top-right */}
      <span
        className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full cursor-help z-10"
        title={tooltipText}
      >
        {en.table.botBadge}
      </span>

      {/* Robot avatar */}
      <RobotIcon />

      {/* Name with (Bot) suffix */}
      <span className="text-white text-xs font-medium truncate max-w-[72px]">
        {originalDisplayName} {en.table.botNameSuffix}
      </span>

      {/* Card count */}
      <span className="text-slate-400 text-xs">
        {en.table.cardCount.replace('{count}', String(playerState.hand.length))}
      </span>

      {/* Face-down card fan */}
      {visibleCards > 0 && (
        <div
          className="flex items-center justify-center mt-1"
          aria-label={`${playerState.hand.length} cards face down`}
          role="img"
        >
          {Array.from({ length: visibleCards }).map((_, i) => (
            <div
              key={i}
              className="w-5 h-7 rounded-sm border border-slate-500 bg-slate-900 overflow-hidden"
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
      )}

      {/* Score */}
      <span className="text-slate-300 text-xs">
        {playerState.score} pts
      </span>

      {/* Thinking indicator during turn */}
      {isCurrentTurn && (
        <span className="text-purple-300 text-xs animate-pulse">
          {en.table.thinking}
        </span>
      )}
    </div>
  );
}
