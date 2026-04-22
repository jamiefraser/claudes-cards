/**
 * CribbageCountingDisplay — "the show" between pegging and the next deal.
 *
 * Counting is turn-based, starting with the player to the dealer's left
 * (clockwise from dealer+1) and ending with the dealer. The dealer's crib
 * counts last. The active counter's hand + score is shown; pegs advance on
 * their ack (rendered by the parent GameTable via the cribbage board).
 *
 * The hand under count is sorted by rank, and each scoring combination is
 * called out underneath with the specific cards involved — mirroring the way
 * the game is counted at a real table ("15 2, 15 4, and a pair is 6").
 */
import React from 'react';
import type { Card } from '@shared/cards';
import { CardComponent } from '../cards/CardComponent';
import { computeBreakdown, sortByRank, type ScoreEntry } from '@/utils/cribbageScore';

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

function MiniCardRow({ cards }: { cards: Card[] }) {
  return (
    <div className="flex flex-row gap-1 items-center">
      {cards.map((c) => {
        const isRed = c.suit === 'hearts' || c.suit === 'diamonds';
        return (
          <span
            key={c.id}
            className="inline-flex items-center justify-center min-w-[1.6rem] h-6 px-1 rounded border border-hairline bg-paper text-xs font-semibold font-mono"
            style={{
              color: isRed
                ? 'rgb(var(--board-milestone))'
                : 'rgb(var(--ink))',
            }}
          >
            {c.rank}
            {suitGlyph(c.suit)}
          </span>
        );
      })}
    </div>
  );
}

function suitGlyph(suit: Card['suit']): string {
  switch (suit) {
    case 'spades': return '♠';
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    default: return '';
  }
}

function BreakdownEntries({ entries }: { entries: ScoreEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm italic text-whisper">
        Nineteen — no points in this hand.
      </p>
    );
  }
  let running = 0;
  return (
    <ol className="flex flex-col gap-1.5 text-sm text-ink-soft">
      {entries.map((e, idx) => {
        running += e.points;
        return (
          <li
            key={`${e.kind}-${idx}`}
            className="flex flex-row items-center gap-3 flex-wrap"
          >
            <span className="min-w-[2.5rem] text-right tabular-nums font-mono font-semibold text-ochre">
              {running}
            </span>
            <span className="min-w-[6rem] text-ink">
              {e.label}{' '}
              <span className="text-whisper">+{e.points}</span>
            </span>
            <MiniCardRow cards={e.cards} />
          </li>
        );
      })}
    </ol>
  );
}

function CardRow({ cards }: { cards: Card[] }) {
  return (
    <div className="flex flex-row gap-1 flex-wrap">
      {cards.map((c) => (
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
  const rawHand =
    currentCountPlayerId != null ? (scoringHands[currentCountPlayerId] ?? []) : [];
  const counterHand = sortByRank(rawHand);
  const counterScore =
    currentCountPlayerId != null ? (handScores[currentCountPlayerId] ?? 0) : 0;
  const counterIsDealer =
    currentCountPlayerId != null && currentCountPlayerId === dealerId;

  const sortedCrib = sortByRank(crib);
  const breakdown =
    step === 'hand'
      ? computeBreakdown(rawHand, cutCard, false)
      : computeBreakdown(crib, cutCard, true);

  return (
    <div
      className="flex flex-col gap-3 p-3 sm:p-4 rounded-xl bg-paper-raised/85 border border-hairline/70 shadow-paper w-full max-w-2xl"
      aria-label="Cribbage counting"
    >
      <div className="flex flex-row items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-whisper">
            Starter
          </span>
          {cutCard ? (
            <CardComponent card={cutCard} faceUp={true} selected={false} />
          ) : (
            <div className="w-12 h-[4.5rem] sm:w-16 sm:h-24 rounded-md border-2 border-dashed border-hairline bg-paper-deep/40" />
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <h3 className="font-display text-base sm:text-lg font-semibold text-ink">
            {step === 'hand'
              ? `${counterName}${counterIsDealer ? ' (dealer)' : ''} counts`
              : "Dealer's crib"}
          </h3>
          <p className="text-xs text-whisper mt-0.5">
            {step === 'hand'
              ? 'Hand sorted by rank. Pegs advance on acknowledge.'
              : 'The crib counts for the dealer.'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-whisper">
            Points
          </span>
          <span className="font-display text-3xl sm:text-4xl font-semibold tabular-nums text-ochre">
            {step === 'hand' ? counterScore : cribScore}
          </span>
        </div>
      </div>

      {step === 'hand' && <CardRow cards={counterHand} />}
      {step === 'crib' && <CardRow cards={sortedCrib} />}

      {/* Breakdown — long scoring hands can produce 9+ rows. Cap the
          entry list at 40vh and scroll inside it; the grand total stays
          pinned below so it's always visible. */}
      <div className="mt-1 pt-3 border-t border-hairline/60 flex flex-col gap-2">
        <div
          className="max-h-[40vh] overflow-y-auto pr-1"
          aria-label="Scoring breakdown"
        >
          <BreakdownEntries entries={breakdown.entries} />
        </div>
        <div className="pt-2 border-t border-hairline/60 flex flex-row items-center gap-3">
          <span className="min-w-[2.5rem] text-right tabular-nums font-mono font-semibold text-ochre">
            {breakdown.total}
          </span>
          <span className="font-display font-semibold text-ink">Total</span>
        </div>
      </div>
    </div>
  );
}
