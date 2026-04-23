/**
 * GameScreen -- full-height flex-column root for the game table.
 *
 * Presentational only: no store reads, no socket calls.
 * Provides the cream background (--paper token) and centres the
 * content vertically + horizontally.
 */
import React from 'react';

export interface GameScreenProps {
  children: React.ReactNode;
}

export function GameScreen({ children }: GameScreenProps) {
  return (
    <div
      className="relative flex flex-col min-h-screen bg-paper font-sans text-ink"
      data-testid="game-screen"
    >
      {children}
    </div>
  );
}
