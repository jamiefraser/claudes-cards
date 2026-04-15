import React from 'react';

export interface TableFeltProps {
  readonly width: number;
  readonly height: number;
  readonly children?: React.ReactNode;
}

/**
 * The play surface. Currently flat — cards float on the night background
 * with no felt, no rim. Kept as a component so a future surface treatment
 * (rectangular slab, vignette, gradient, etc.) is one file's worth of work.
 */
export function TableFelt({ width, height, children }: TableFeltProps) {
  return (
    <div
      className="relative rounded-[32px] shadow-felt-rim overflow-hidden"
      style={{
        width,
        height,
        background:
          'radial-gradient(ellipse at center, #13604a 0%, #0d4938 55%, #08301f 100%)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 3px)',
        }}
      />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}
