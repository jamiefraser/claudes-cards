import { useMemo } from 'react';

export interface SeatPoint {
  readonly x: number;
  readonly y: number;
  readonly angleDeg: number;
  readonly index: number;
  readonly isSelf: boolean;
}

export interface RadialSeatArgs {
  readonly count: number;
  readonly rx: number;
  readonly ry: number;
  readonly cx: number;
  readonly cy: number;
}

export function computeRadialSeats(args: RadialSeatArgs): readonly SeatPoint[] {
  const { count, rx, ry, cx, cy } = args;
  if (count <= 0) return [];

  const seats: SeatPoint[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.PI / 2 + (i * 2 * Math.PI) / count;
    const x = cx + rx * Math.cos(theta);
    const y = cy + ry * Math.sin(theta);
    const angleDeg = ((theta * 180) / Math.PI + 360) % 360;
    seats.push({ x, y, angleDeg, index: i, isSelf: i === 0 });
  }
  return seats;
}

export function useRadialSeats(args: RadialSeatArgs): readonly SeatPoint[] {
  const { count, rx, ry, cx, cy } = args;
  return useMemo(
    () => computeRadialSeats({ count, rx, ry, cx, cy }),
    [count, rx, ry, cx, cy],
  );
}
