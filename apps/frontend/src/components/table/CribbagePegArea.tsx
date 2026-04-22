/**
 * CribbagePegArea — shows the running pegging count and cards played so far
 * in the current round of the play. Visible during the cribbage pegging
 * phase only.
 *
 * Visual treatment (Heirloom direction):
 *   • Previously-played cards render at 0.55 opacity so the eye lands on
 *     the card that was *just* played (full brightness, last-in-array).
 *   • The running count is a large brass-rimmed chip to the right of the
 *     pegging pile — the single most-consulted readout during a leg.
 *   • When the count resets to 0 (after a "Go" or a 31), the chip briefly
 *     highlights to signal the reset.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { Card } from '@shared/cards';
import { CardComponent } from '../cards/CardComponent';

export interface CribbagePegAreaProps {
  pegCount: number;
  pegCards: Card[];
  cutCard: Card | null;
}

export function CribbagePegArea({ pegCount, pegCards, cutCard }: CribbagePegAreaProps) {
  // Flash the count chip briefly when it resets back to 0 (Go / 31).
  const prevCountRef = useRef<number>(pegCount);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (pegCount === 0 && prevCountRef.current !== 0) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 360);
      prevCountRef.current = pegCount;
      return () => window.clearTimeout(t);
    }
    prevCountRef.current = pegCount;
  }, [pegCount]);

  return (
    <div
      className={[
        'flex flex-col items-center gap-3',
        'px-3 py-3 sm:px-4 sm:py-4 rounded-xl',
        'bg-paper-raised/80 border border-hairline/70 shadow-paper',
      ].join(' ')}
      aria-label="Cribbage pegging area"
    >
      <div className="flex flex-row items-center gap-4 sm:gap-6">
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

        {/* Big count chip — the single most important readout during pegging. */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-whisper">
            Count
          </span>
          <div
            className={[
              'relative min-w-[3.5rem] sm:min-w-[4.25rem]',
              'px-3 py-1.5 rounded-lg',
              'font-display font-semibold tabular-nums',
              'text-3xl sm:text-4xl text-ink',
              'bg-paper border border-hairline',
              'shadow-[inset_0_1px_0_rgb(var(--paper)_/_0.6),0_2px_6px_-3px_rgb(var(--ink)_/_0.2)]',
              'text-center',
              'transition-[background-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
              flash
                ? 'bg-ochre/15 shadow-[0_0_0_1px_rgb(var(--ochre)_/_0.6),0_6px_16px_-6px_rgb(var(--ochre)_/_0.45)]'
                : '',
            ].join(' ')}
            aria-live="polite"
          >
            {pegCount}
            <span
              aria-hidden
              className="absolute inset-x-2 -bottom-px h-px bg-ochre/60"
            />
          </div>
        </div>
      </div>

      <div className="w-full">
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-whisper block text-center sm:text-left">
          The play
        </span>
        <div className="flex flex-row items-center gap-1 mt-1.5 flex-wrap justify-center">
          {pegCards.length === 0 ? (
            <span className="text-whisper text-sm italic">
              No cards played yet
            </span>
          ) : (
            pegCards.map((card, i) => {
              const isLast = i === pegCards.length - 1;
              return (
                <div
                  key={card.id}
                  style={{
                    // Previously-played cards dim; the most recent play
                    // is at full brightness. A glance at this row tells
                    // you what was just played without reading card faces.
                    opacity: isLast ? 1 : 0.5,
                    transition: 'opacity 180ms ease-out',
                  }}
                >
                  <CardComponent card={card} faceUp={true} selected={false} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
