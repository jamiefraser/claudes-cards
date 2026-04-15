import React from 'react';
import { useRadialSeats, type SeatPoint } from '@/hooks/useRadialSeats';

export interface RadialSeatsProps<T> {
  readonly items: readonly T[];
  readonly rx: number;
  readonly ry: number;
  readonly cx: number;
  readonly cy: number;
  readonly renderSeat: (item: T, seat: SeatPoint) => React.ReactNode;
  readonly getKey: (item: T, index: number) => string;
  readonly seatWidth?: number;
  readonly seatHeight?: number;
}

export function RadialSeats<T>({
  items,
  rx,
  ry,
  cx,
  cy,
  renderSeat,
  getKey,
  seatWidth = 176,
  seatHeight = 72,
}: RadialSeatsProps<T>) {
  const points = useRadialSeats({ count: items.length, rx, ry, cx, cy });

  return (
    <>
      {items.map((item, i) => {
        const p = points[i];
        if (!p) return null;
        const style: React.CSSProperties = {
          position: 'absolute',
          left: p.x - seatWidth / 2,
          top: p.y - seatHeight / 2,
          width: seatWidth,
          height: seatHeight,
          animationDelay: `${i * 60}ms`,
        };
        return (
          <div
            key={getKey(item, i)}
            className="animate-seat-in"
            style={style}
            data-seat-index={i}
            data-seat-self={p.isSelf ? 'true' : undefined}
          >
            {renderSeat(item, p)}
          </div>
        );
      })}
    </>
  );
}
