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
      className="relative rounded-[28px] shadow-felt-rim overflow-hidden"
      style={{
        // Fluid — the parent caps width at 880px. Mobile/tablet let the
        // felt shrink to fit rather than overflow.
        width: '100%',
        maxWidth: width,
        aspectRatio: `${width} / ${height}`,
        height: 'auto',
        background:
          // Le Salon felt: muted forest, centre glow slightly lighter.
          'radial-gradient(ellipse at 50% 40%, rgb(var(--felt-light)) 0%, rgb(var(--felt)) 55%, rgb(var(--felt-deep)) 100%)',
      }}
    >
      {/* Fine cross-hatch — gives the felt its woven character. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgb(var(--hairline)) 0 1px, transparent 1px 3px)',
        }}
      />
      {/* Inner hairline — the rim detail. */}
      <div
        aria-hidden
        className="absolute inset-2 rounded-[22px] pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--hairline) / 0.28)' }}
      />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}
