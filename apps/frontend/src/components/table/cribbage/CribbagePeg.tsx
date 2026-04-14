/**
 * CribbagePeg — animated peg on the cribbage board.
 * SPEC.md §19 Story 8.5
 */
import React, { useEffect, useRef } from 'react';
import { useSound } from '@/hooks/useSound';

export type PegColor = 'red' | 'blue' | 'green';

export interface CribbagePegProps {
  /** Player ID — used for data attributes */
  playerId: string;
  /** front or back peg */
  pegType: 'front' | 'back';
  /** SVG x coordinate */
  x: number;
  /** SVG y coordinate */
  y: number;
  color: PegColor;
  /** Hole position for animation tracking */
  position: number;
}

const COLOR_MAP: Record<PegColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
};

const LIGHTER_COLOR_MAP: Record<PegColor, string> = {
  red: '#fca5a5',
  blue: '#93c5fd',
  green: '#86efac',
};

export function CribbagePeg({
  playerId,
  pegType,
  x,
  y,
  color,
  position,
}: CribbagePegProps) {
  const { play } = useSound();
  const prevPositionRef = useRef(position);
  const isFront = pegType === 'front';

  useEffect(() => {
    if (isFront && position !== prevPositionRef.current) {
      play('peg-move');
      prevPositionRef.current = position;
    }
  }, [position, isFront, play]);

  const fill = isFront ? COLOR_MAP[color] : LIGHTER_COLOR_MAP[color];
  const radius = isFront ? 7 : 6;
  const opacity = isFront ? 1 : 0.5;

  return (
    <circle
      data-peg={`${playerId}-${pegType}`}
      cx={x}
      cy={y}
      r={radius}
      fill={fill}
      opacity={opacity}
      style={{
        transition: 'cx 0.4s ease, cy 0.4s ease',
        filter: isFront
          ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))'
          : undefined,
      }}
    />
  );
}
