/**
 * CribbagePeg — a single peg on the spiral board.
 *
 * Takes the *lane's* pre-computed hole positions and the target hole index.
 * When the target changes, the peg animates along the spiral — not a
 * straight chord — by interpolating between adjacent hole positions over a
 * duration proportional to the number of holes traversed (80ms/hole, capped
 * at 600ms).
 *
 * Reduced-motion path: snaps to the destination and fades the peg's
 * opacity from 0.6 → 1 over 140ms at the landing hole. No halo ring (the
 * landing halo is motion, not information).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSound } from '@/hooks/useSound';

export type PegColor = 'red' | 'blue' | 'green';

export interface CribbagePegProps {
  readonly playerId: string;
  readonly pegType: 'front' | 'back';
  /** Full hole position array for this lane — 0..121. */
  readonly holes: ReadonlyArray<{ x: number; y: number }>;
  /** Target hole index. Clamped to [0, holes.length - 1] before use. */
  readonly position: number;
  readonly color: PegColor;
}

const MS_PER_HOLE = 80;
const MAX_MS = 600;
const HALO_MS = 220;
const LAND_FADE_MS = 140;

function getReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CribbagePeg({
  playerId,
  pegType,
  holes,
  position,
  color,
}: CribbagePegProps) {
  const { play } = useSound();
  const isFront = pegType === 'front';

  // Live reduced-motion preference — re-evaluated whenever the OS
  // preference changes (not just at mount).
  const [reducedMotion, setReducedMotion] = useState<boolean>(getReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mql.matches);
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, []);

  // Clamp target before any effect fires so a transient server value of
  // -1 / 122 can't trigger a bogus sound or halo.
  const safeTarget = Math.max(0, Math.min(holes.length - 1, position));

  const [renderedIdx, setRenderedIdx] = useState<number>(safeTarget);
  const prevPositionRef = useRef<number>(safeTarget);
  const rafRef = useRef<number | null>(null);
  const [haloAt, setHaloAt] = useState<number | null>(null);
  const [landFadeAt, setLandFadeAt] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevPositionRef.current;
    if (safeTarget === prev) return;

    if (isFront) play('peg-move');

    if (reducedMotion) {
      // Reduced motion — snap, fade destination briefly. No halo.
      setRenderedIdx(safeTarget);
      setLandFadeAt(safeTarget);
      const t = window.setTimeout(() => setLandFadeAt(null), LAND_FADE_MS);
      prevPositionRef.current = safeTarget;
      return () => window.clearTimeout(t);
    }

    // Full motion — RAF along the spiral.
    const startIdx = prev;
    const endIdx = safeTarget;
    const distance = Math.abs(endIdx - startIdx);
    const duration = Math.min(MAX_MS, Math.max(120, distance * MS_PER_HOLE));
    const startTime = performance.now();

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic — dwell at landing feels intentional, not abrupt.
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = startIdx + (endIdx - startIdx) * eased;
      setRenderedIdx(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        prevPositionRef.current = endIdx;
        if (isFront) {
          setHaloAt(endIdx);
          window.setTimeout(() => setHaloAt(null), HALO_MS);
        }
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [safeTarget, isFront, play, reducedMotion]);

  // Interpolate rendered position between adjacent hole positions.
  const clampedIdx = Math.max(0, Math.min(holes.length - 1, renderedIdx));
  const lo = Math.floor(clampedIdx);
  const hi = Math.min(holes.length - 1, lo + 1);
  const frac = clampedIdx - lo;
  const a = holes[lo]!;
  const b = holes[hi]!;
  const x = a.x + (b.x - a.x) * frac;
  const y = a.y + (b.y - a.y) * frac;

  const radius = isFront ? 4.6 : 3.6;
  const baseOpacity = isFront ? 1 : 0.6;
  const landing = landFadeAt === safeTarget;
  const opacity = landing ? 0.65 : baseOpacity;
  const paletteVar = `rgb(var(--color-card-${color}))`;
  // 3D ball-head peg: contact shadow + coloured dome + specular highlight.
  // Static geometry (no filter) so it doesn't re-paint per RAF frame.
  const highlightR = radius * 0.35;
  const highlightX = x - radius * 0.32;
  const highlightY = y - radius * 0.32;
  const shadowR = radius * 0.9;
  const shadowX = x + radius * 0.25;
  const shadowY = y + radius * 0.55;

  return (
    <g data-peg={`${playerId}-${pegType}`}>
      {/* Landing halo — motion-only. Omitted entirely under reduced-motion. */}
      {isFront && haloAt !== null && !reducedMotion && (
        <circle
          className="cribbage-halo"
          cx={holes[Math.max(0, Math.min(holes.length - 1, haloAt))]!.x}
          cy={holes[Math.max(0, Math.min(holes.length - 1, haloAt))]!.y}
          r={10}
          opacity={0.85}
          style={{
            fill: 'none',
            stroke: paletteVar,
            strokeWidth: 1.5,
            // SVG transforms need transform-box: fill-box so scale
            // originates from the circle's own centre, not the SVG root.
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: `cribbage-halo ${HALO_MS}ms ease-out forwards`,
          }}
          aria-hidden
        />
      )}
      {/* Contact shadow — front peg only. Ellipse below-right of the peg,
          static so it doesn't recompute per RAF frame. */}
      {isFront && (
        <ellipse
          cx={shadowX}
          cy={shadowY}
          rx={shadowR}
          ry={shadowR * 0.35}
          opacity={0.35}
          style={{ fill: 'rgb(var(--ink))' }}
          aria-hidden
        />
      )}
      {/* Peg body — the coloured dome. */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        opacity={opacity}
        style={{
          fill: paletteVar,
          stroke: 'rgb(var(--ink) / 0.55)',
          strokeWidth: 0.5,
          transition: landing ? `opacity ${LAND_FADE_MS}ms ease-out` : undefined,
        }}
      />
      {/* Specular highlight — small paper-coloured spot for the ball-head look. */}
      {isFront && (
        <circle
          cx={highlightX}
          cy={highlightY}
          r={highlightR}
          opacity={0.75}
          style={{ fill: 'rgb(var(--paper))' }}
          aria-hidden
        />
      )}
    </g>
  );
}

