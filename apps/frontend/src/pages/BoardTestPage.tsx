/**
 * BoardTestPage — dev-only visual harness for the CribbageBoard component.
 *
 * Renders the spiral board in the three canonical Phase-4 states so the
 * Playwright validation pass can screenshot each without having to drive
 * a real cribbage game to specific score values.
 *
 * Only mounted in dev (import.meta.env.DEV) — see App.tsx.
 */
import React, { useEffect, useState } from 'react';
import { CribbageBoard } from '@/components/table/cribbage/CribbageBoard';
import type { CribbageBoardState } from '@shared/gameState';

const playerNames: Record<string, string> = {
  'p1': 'Alice',
  'p2': 'Bob',
  'p3': 'Carol',
};

const GAME_START: CribbageBoardState = {
  pegs: [
    { playerId: 'p1', color: 'red',   frontPeg: 0,  backPeg: 0 },
    { playerId: 'p2', color: 'blue',  frontPeg: 0,  backPeg: 0 },
    { playerId: 'p3', color: 'green', frontPeg: 0,  backPeg: 0 },
  ],
  skunkLine: 91,
  doubleskunkLine: 61,
  winScore: 121,
};

// Pegs at varied positions across different revolutions so the spiral's
// inward progression is visible.
const MID_GAME: CribbageBoardState = {
  pegs: [
    { playerId: 'p1', color: 'red',   frontPeg: 28, backPeg: 22 },
    { playerId: 'p2', color: 'blue',  frontPeg: 65, backPeg: 58 },
    { playerId: 'p3', color: 'green', frontPeg: 103, backPeg: 96 },
  ],
  skunkLine: 91,
  doubleskunkLine: 61,
  winScore: 121,
};

// Score-just-landed: pre-change state rendered first, then swap to the
// post-change. The CribbagePeg animator interpolates between them for
// ~600ms — the shot lands mid-sweep if captured in that window.
const LANDING_BEFORE: CribbageBoardState = {
  pegs: [
    { playerId: 'p1', color: 'red',  frontPeg: 48, backPeg: 44 },
    { playerId: 'p2', color: 'blue', frontPeg: 70, backPeg: 62 },
  ],
  skunkLine: 91,
  doubleskunkLine: 61,
  winScore: 121,
};
const LANDING_AFTER: CribbageBoardState = {
  pegs: [
    { playerId: 'p1', color: 'red',  frontPeg: 62, backPeg: 48 }, // scored 14
    { playerId: 'p2', color: 'blue', frontPeg: 70, backPeg: 62 },
  ],
  skunkLine: 91,
  doubleskunkLine: 61,
  winScore: 121,
};

type StateKey = 'start' | 'mid' | 'landing';
const STATES: Record<StateKey, CribbageBoardState> = {
  start: GAME_START,
  mid: MID_GAME,
  landing: LANDING_AFTER,
};

export function BoardTestPage() {
  const [which, setWhich] = useState<StateKey>('start');
  const [state, setState] = useState<CribbageBoardState>(GAME_START);

  // Sync state with the picker; for 'landing', animate from pre to post
  // 200ms after render so the shot can catch the sweep.
  useEffect(() => {
    if (which !== 'landing') {
      setState(STATES[which]);
      return;
    }
    setState(LANDING_BEFORE);
    const t = window.setTimeout(() => setState(LANDING_AFTER), 250);
    return () => window.clearTimeout(t);
  }, [which]);

  return (
    <div className="min-h-screen bg-paper text-ink p-4 sm:p-6 flex flex-col gap-4">
      <header className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-xl sm:text-2xl font-semibold">Cribbage board — test harness</h1>
        <div
          role="radiogroup"
          aria-label="Board state"
          className="inline-flex items-center gap-1 p-0.5 rounded-full bg-paper-raised/70 border border-hairline/60"
        >
          {(['start', 'mid', 'landing'] as StateKey[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={which === k}
              onClick={() => setWhich(k)}
              data-state={which === k ? 'active' : undefined}
              className={[
                'min-h-[36px] px-3 rounded-full text-xs font-medium touch-manipulation',
                'transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
                which === k
                  ? 'bg-paper text-ink shadow-paper'
                  : 'text-ink-soft hover:bg-paper/60',
              ].join(' ')}
            >
              {k === 'start' ? 'Game start' : k === 'mid' ? 'Mid-game' : 'Score landing'}
            </button>
          ))}
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-2xl"
        data-board-state={which}
      >
        <CribbageBoard boardState={state} playerNames={playerNames} />
      </main>
    </div>
  );
}
