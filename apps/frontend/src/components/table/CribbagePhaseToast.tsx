/**
 * CribbagePhaseToast — small top-centre banner that surfaces cribbage
 * phase transitions ("Welcome to Pegging", "The show"). Watches the
 * `gamePhase` value from `publicData` and renders a 1800ms toast when
 * the phase changes, then clears itself.
 *
 * Only mounted while the cribbage engine is live (gated by the
 * GameTable render site), so we don't need to branch on game id here.
 *
 * Inspired by the phase-transition banner on cardsjd.com — adapted to
 * Le Salon's quieter material language (paper + brass hairline rather
 * than dark chrome).
 */
import React, { useEffect, useRef, useState } from 'react';
import en from '@/i18n/en.json';

export type CribbagePhase =
  | 'discarding'
  | 'cutting'
  | 'pegging'
  | 'counting'
  | 'ended'
  | string
  | undefined;

export interface CribbagePhaseToastProps {
  readonly phase: CribbagePhase;
}

const LABELS: Record<string, { title: string; sub: string } | undefined> = {
  discarding: {
    title: en.table.cribbagePhaseToastDiscarding,
    sub: en.table.cribbagePhaseToastDiscardingSub,
  },
  cutting: {
    title: en.table.cribbagePhaseToastCutting,
    sub: en.table.cribbagePhaseToastCuttingSub,
  },
  pegging: {
    title: en.table.cribbagePhaseToastPegging,
    sub: en.table.cribbagePhaseToastPeggingSub,
  },
  counting: {
    title: en.table.cribbagePhaseToastCounting,
    sub: en.table.cribbagePhaseToastCountingSub,
  },
  // 'ended' intentionally absent — the win-celebration overlay covers it.
};

const TOAST_MS = 2200;

export function CribbagePhaseToast({ phase }: CribbagePhaseToastProps) {
  const [visible, setVisible] = useState<{ title: string; sub: string } | null>(null);
  const prevPhaseRef = useRef<CribbagePhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    // Don't fire on first mount — the player is already in whatever phase.
    if (prev === undefined) return;
    if (prev === phase) return;
    if (!phase) return;

    const label = LABELS[phase];
    if (!label) return;

    setVisible(label);
    const t = window.setTimeout(() => setVisible(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'pointer-events-none',
        'absolute left-1/2 -translate-x-1/2 top-3 sm:top-4',
        'z-raised max-w-[90vw]',
        'animate-seat-in',
      ].join(' ')}
    >
      <div
        className={[
          'inline-flex flex-col items-center gap-0.5',
          'px-4 py-2 rounded-xl',
          'bg-paper-raised/95 border border-hairline shadow-paper backdrop-blur',
          'font-display',
          'min-w-[12rem]',
        ].join(' ')}
      >
        <span className="text-base sm:text-lg font-semibold text-ink leading-tight">
          {visible.title}
        </span>
        <span className="text-xs text-whisper tracking-wide">
          {visible.sub}
        </span>
      </div>
    </div>
  );
}
