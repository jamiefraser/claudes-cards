/**
 * CribbageCountingDisplay — "the show" between pegging and the next deal.
 *
 * Counting is turn-based, starting with the player to the dealer's left
 * (clockwise from dealer+1) and ending with the dealer. The dealer's crib
 * counts last. The active counter's hand + score is shown; pegs advance on
 * their ack (rendered by the parent GameTable via the cribbage board).
 */
import React from 'react';
import type { Card } from '@shared/cards';
import { CardComponent } from '../cards/CardComponent';

export interface CribbageCountingDisplayProps {
  step: 'hand' | 'crib';
  cutCard: Card | null;
  /** The active counter's playerId. */
  currentCountPlayerId: string | undefined;
  /** Per-player snapshot of the 4-card hand. */
  scoringHands: Record<string, Card[]>;
  /** Per-player precomputed score (shown with the hand). */
  handScores: Record<string, number>;
  /** Dealer's crib (4 cards). */
  crib: Card[];
  /** Crib score (shown during 'crib' step). */
  cribScore: number;
  /** playerId → display name. */
  playerNames: Record<string, string>;
  /** Seat index of the dealer. */
  dealerIndex: number;
  /** Ordered seat list — used to identify the dealer. */
  playerIds: string[];
}

function CardRow({ cards }: { cards: Card[] }) {
  return (
    <div className="flex flex-row gap-1 flex-wrap">
      {cards.map(c => (
        <CardComponent key={c.id} card={c} faceUp={true} selected={false} />
      ))}
    </div>
  );
}

export function CribbageCountingDisplay({
  step,
  cutCard,
  currentCountPlayerId,
  scoringHands,
  handScores,
  crib,
  cribScore,
  playerNames,
  dealerIndex,
  playerIds,
}: CribbageCountingDisplayProps) {
  const dealerId = playerIds[dealerIndex];
  const counterName =
    currentCountPlayerId != null
      ? (playerNames[currentCountPlayerId] ?? currentCountPlayerId)
      : '';
  const counterHand =
    currentCountPlayerId != null ? (scoringHands[currentCountPlayerId] ?? []) : [];
  const counterScore =
    currentCountPlayerId != null ? (handScores[currentCountPlayerId] ?? 0) : 0;
  const counterIsDealer =
    currentCountPlayerId != null && currentCountPlayerId === dealerId;

  return (
    <div
      className="flex flex-col gap-3 p-3 sm:p-4 rounded-md bg-slate-800/80 border border-slate-700 w-full max-w-2xl"
      aria-label="Cribbage counting"
    >
      <div className="flex flex-row items-center gap-3">
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase text-slate-400">Starter</span>
          {cutCard ? (
            <CardComponent card={cutCard} faceUp={true} selected={false} />
          ) : (
            <div className="w-12 h-[4.5rem] sm:w-16 sm:h-24 rounded-md border-2 border-dashed border-slate-600 bg-slate-900" />
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-amber-300">
            {step === 'hand'
              ? `${counterName}${counterIsDealer ? ' (dealer)' : ''} counts`
              : "Dealer's crib"}
          </h3>
          <p className="text-xs text-slate-400">
            {step === 'hand'
              ? 'Hand scored against the starter. Pegs advance on acknowledge.'
              : 'The crib counts for the dealer.'}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs uppercase text-slate-400">Points</span>
          <span className="text-2xl sm:text-3xl font-bold text-amber-300">
            {step === 'hand' ? counterScore : cribScore}
          </span>
        </div>
      </div>

      {step === 'hand' && <CardRow cards={counterHand} />}
      {step === 'crib' && <CardRow cards={crib} />}
    </div>
  );
}
