/**
 * CribbagePegArea — shows the running pegging count and cards played so far
 * in the current round of the play. Visible during the cribbage pegging
 * phase only.
 */
import React from 'react';
import type { Card } from '@shared/cards';
import { CardComponent } from '../cards/CardComponent';

export interface CribbagePegAreaProps {
  pegCount: number;
  pegCards: Card[];
  cutCard: Card | null;
}

export function CribbagePegArea({ pegCount, pegCards, cutCard }: CribbagePegAreaProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 p-3 rounded-md bg-slate-800/80 border border-slate-700"
      aria-label="Cribbage pegging area"
    >
      <div className="flex flex-row items-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase text-slate-400">Starter</span>
          {cutCard ? (
            <CardComponent card={cutCard} faceUp={true} selected={false} />
          ) : (
            <div className="w-12 h-[4.5rem] sm:w-16 sm:h-24 rounded-md border-2 border-dashed border-slate-600 bg-slate-900" />
          )}
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase text-slate-400">Count</span>
          <span className="text-2xl sm:text-3xl font-bold text-amber-300">{pegCount}</span>
        </div>
      </div>

      <div className="w-full">
        <span className="text-xs uppercase text-slate-400">The Play</span>
        <div className="flex flex-row items-center gap-1 mt-1 flex-wrap justify-center">
          {pegCards.length === 0 ? (
            <span className="text-slate-500 text-sm">No cards played yet</span>
          ) : (
            pegCards.map((card) => (
              <CardComponent
                key={card.id}
                card={card}
                faceUp={true}
                selected={false}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
