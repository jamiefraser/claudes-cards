import React from 'react';
import en from '@/i18n/en.json';

export interface RoomInfoPillProps {
  readonly roomCode: string;
  readonly currentHand: number;
  readonly totalHands: number;
}

export function RoomInfoPill({ roomCode, currentHand, totalHands }: RoomInfoPillProps) {
  const label = en.table.roomInfo
    .replace('{code}', roomCode)
    .replace('{current}', String(currentHand))
    .replace('{total}', String(totalHands));

  return (
    <div
      className={[
        'inline-flex items-center gap-2 px-4 py-1.5 rounded-full',
        'bg-night-raised/70 backdrop-blur',
        'border border-brass/20',
        'font-display text-[0.78rem] tracking-[0.2em] uppercase',
        'text-brass-bright/90',
      ].join(' ')}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-brass animate-pulse" />
      <span>{label}</span>
    </div>
  );
}
