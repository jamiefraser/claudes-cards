/**
 * CribbageBoard — classic three-lane serpentine ("U-track") scoring board.
 *
 * Public API unchanged — `{ boardState, playerNames }`. Peg indices
 * (0..121 on `frontPeg` / `backPeg`) are the same domain, so no engine
 * or shared-types change.
 *
 * Geometry lives in `./spiralGeometry.ts` (module name retained for
 * import stability; content is now a serpentine layout). Substrate +
 * brass + hole colours come from theme-level CSS variables (`--board-*`
 * in tokens.css).
 *
 * SPEC.md §19 Story 8.5 (cribbage board + peg movement).
 */
import React, { useEffect, useRef, useState } from 'react';
import type { CribbageBoardState } from '@shared/gameState';
import { CribbagePeg, type PegColor } from './CribbagePeg';
import {
  BOARD,
  VIEWBOX_WIDTH,
  VIEWBOX_HEIGHT,
  HOLES_PER_LANE,
} from './spiralGeometry';
import en from '@/i18n/en.json';

export interface CribbageBoardProps {
  readonly boardState: CribbageBoardState;
  readonly playerNames: Record<string, string>;
}

const LANE_ORDER: ReadonlyArray<PegColor> = ['red', 'blue', 'green'];
const LANE_GLYPH: Record<PegColor, string> = {
  red: '♥',
  blue: '♠',
  green: '♦',
};

const SKUNK_HOLE = 91;
const DOUBLE_SKUNK_HOLE = 61;

/** Hue classes per lane — used on the text-score dots below the board. */
function laneDotColor(color: PegColor): string {
  return color === 'red'
    ? 'bg-[rgb(var(--color-card-red))]'
    : color === 'blue'
    ? 'bg-[rgb(var(--color-card-blue))]'
    : 'bg-[rgb(var(--color-card-green))]';
}

export function CribbageBoard({ boardState, playerNames }: CribbageBoardProps) {
  const { pegs } = boardState;

  // Live-region announcement + on-board visual delta banner.
  //   • First render seeds prev scores so we don't announce "scored 0".
  //   • Multi-peg updates in one tick are coalesced into one announcement.
  //   • Win condition ("reached 121") gets its own loud message.
  //   • The visual banner (`+N {name}`) is the same data, rendered as a
  //     large brass-on-paper label near the top of the board for ~1.8s.
  const prevScoresRef = useRef<Record<string, number> | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [deltaBanner, setDeltaBanner] = useState<{
    name: string;
    delta: number;
    win: boolean;
    color: PegColor;
  } | null>(null);
  useEffect(() => {
    if (prevScoresRef.current === null) {
      // Seed on first render — every peg gets its starting position
      // recorded so subsequent updates compute the right delta.
      const seed: Record<string, number> = {};
      for (const peg of pegs) seed[peg.playerId] = peg.frontPeg;
      prevScoresRef.current = seed;
      return;
    }
    const prev = prevScoresRef.current;
    const lines: string[] = [];
    // The largest scoring event in the tick becomes the banner — if two
    // players score on the same frame (rare), the bigger delta wins.
    let bannerCandidate: { name: string; delta: number; win: boolean; color: PegColor } | null = null;
    for (const peg of pegs) {
      const before = prev[peg.playerId];
      if (before === undefined) {
        prev[peg.playerId] = peg.frontPeg;
        continue;
      }
      if (peg.frontPeg === before) continue;
      const name = playerNames[peg.playerId] ?? peg.playerId;
      const delta = peg.frontPeg - before;
      const win = peg.frontPeg >= 121;
      if (win) {
        lines.push(
          en.table.cribbageWinAnnouncement.replace('{name}', name),
        );
      } else if (delta > 0) {
        lines.push(
          en.table.cribbageScoreAnnouncement
            .replace('{name}', name)
            .replace('{delta}', String(delta))
            .replace('{score}', String(peg.frontPeg)),
        );
      } else {
        lines.push(
          en.table.cribbageAdjustAnnouncement
            .replace('{name}', name)
            .replace('{score}', String(peg.frontPeg)),
        );
      }
      // Banner: only meaningful for positive deltas. A regression
      // ('adjust') is quiet — it's usually a correction not a score.
      if (delta > 0) {
        if (!bannerCandidate || Math.abs(delta) > Math.abs(bannerCandidate.delta)) {
          bannerCandidate = { name, delta, win, color: peg.color };
        }
      }
      prev[peg.playerId] = peg.frontPeg;
    }
    if (lines.length > 0) setAnnouncement(lines.join(' '));
    if (bannerCandidate) {
      setDeltaBanner(bannerCandidate);
      const id = window.setTimeout(() => setDeltaBanner(null), 1800);
      return () => window.clearTimeout(id);
    }
  }, [pegs, playerNames]);

  // Milestone ticks — vertical lines across all three lanes at the
  // middle-lane x position of hole 91 / 61.
  const skunkTick = BOARD.milestoneAt(SKUNK_HOLE);
  const doubleSkunkTick = BOARD.milestoneAt(DOUBLE_SKUNK_HOLE);

  // Pre-render the three lanes in canonical order. An empty lane is still
  // drawn (as wood + brass groove with no peg) so the layout is stable
  // whether the room has 2 or 3 players. Cheap enough to recompute on
  // every render — no memo needed.
  const lanesView = LANE_ORDER.map((color, laneIdx) => {
    const geom = BOARD.lanes[laneIdx]!;
    const pegSet = pegs.find((p) => p.color === color);
    return { color, laneIdx, geom, pegSet };
  });

  return (
    <div className="relative w-full max-w-full">
      {/* Live-region announcer — screen-reader-only. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Score-delta banner — large, brief "+N Name" label that sits over
          the board when any player scores. Mirrors what the live region
          says for sighted users. Fades in via the shared seat-in keyframe
          and clears itself via the parent effect's timeout. */}
      {deltaBanner && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-1 z-raised animate-seat-in"
        >
          <div
            className={[
              'inline-flex items-baseline gap-2',
              'px-4 py-1.5 rounded-full',
              'bg-paper-raised/95 border border-hairline shadow-paper backdrop-blur',
              'font-display',
            ].join(' ')}
          >
            <span
              className="text-2xl sm:text-3xl font-semibold tabular-nums"
              style={{
                color: `rgb(var(--color-card-${deltaBanner.color}))`,
              }}
            >
              +{deltaBanner.delta}
            </span>
            <span className="text-sm text-ink-soft truncate max-w-[10rem]">
              {deltaBanner.name}
            </span>
            {deltaBanner.win && (
              <span className="text-xs uppercase tracking-[0.18em] text-burgundy font-semibold">
                121
              </span>
            )}
          </div>
        </div>
      )}

      <svg
        role="img"
        aria-label={en.table.cribbageBoardAriaLabel}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto block"
      >
        <defs>
          {/* Subtle wood grain via turbulence, low scale so the spiral
              reads cleanly over it. Applied only to the substrate rect —
              isolating it from animated layers. */}
          <filter id="cribbage-grain" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.1"
              numOctaves="2"
              stitchTiles="stitch"
              seed="7"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.28
                      0 0 0 0 0.22
                      0 0 0 0 0.16
                      0 0 0 0.25 0"
            />
            <feComposite in2="SourceGraphic" operator="in" />
            <feBlend in="SourceGraphic" mode="multiply" />
          </filter>
          {/* Landing-halo keyframes live in globals.css so they respect
              the global prefers-reduced-motion guard and don't leak per
              component mount. */}
        </defs>

        {/* Substrate — wood slab. */}
        <rect
          x={0}
          y={0}
          width={VIEWBOX_WIDTH}
          height={VIEWBOX_HEIGHT}
          rx={14}
          ry={14}
          fill="rgb(var(--board-substrate))"
          filter="url(#cribbage-grain)"
        />
        {/* Inner field with a hairline bezel. */}
        <rect
          x={6}
          y={6}
          width={VIEWBOX_WIDTH - 12}
          height={VIEWBOX_HEIGHT - 12}
          rx={10}
          ry={10}
          fill="rgb(var(--board-substrate))"
          stroke="rgb(var(--board-bezel) / 0.55)"
          strokeWidth={0.8}
        />

        {/* ── LANES ──────────────────────────────────────────────── */}
        {lanesView.map(({ color, laneIdx, geom, pegSet }) => {
          const ownerId = pegSet?.playerId ?? `empty-${laneIdx}`;
          const isEmpty = !pegSet;

          return (
            <g
              key={ownerId}
              data-lane={ownerId}
              data-lane-empty={isEmpty ? 'true' : undefined}
            >
              {/* The routed groove — a wide soft stroke under the brass. */}
              <path
                d={geom.path}
                fill="none"
                stroke="rgb(var(--board-substrate-deep))"
                strokeWidth={7}
                strokeLinecap="round"
                opacity={0.28}
              />
              {/* Brass inlay ribbon down the groove. */}
              <path
                d={geom.path}
                fill="none"
                stroke="rgb(var(--board-bezel))"
                strokeWidth={0.6}
                opacity={isEmpty ? 0.2 : 0.55}
              />

              {/* Regular scoring holes 1..120. Hole 0 sits under the start
                  cluster marker; hole 121 is rendered below as the goal. */}
              {geom.holes.slice(1, HOLES_PER_LANE - 1).map((h, i) => {
                const holeNum = i + 1;
                const isFive = holeNum % 5 === 0;
                return (
                  <circle
                    key={holeNum}
                    data-hole={`${ownerId}-${holeNum}`}
                    cx={h.x}
                    cy={h.y}
                    r={isFive ? 2.6 : 2.1}
                    fill="rgb(var(--board-hole))"
                    stroke={isFive ? 'rgb(var(--board-hole-rim))' : 'rgb(var(--board-substrate-deep) / 0.6)'}
                    strokeWidth={isFive ? 0.8 : 0.3}
                  />
                );
              })}

              {/* Start-cluster marker at hole 0 — three small dots + suit
                  glyph. Keeps the visual separate from the numbered holes. */}
              <g aria-hidden>
                {(() => {
                  const h = geom.holes[0]!;
                  const h1 = geom.holes[1]!;
                  // Unit tangent
                  const tx = h1.x - h.x;
                  const ty = h1.y - h.y;
                  const len = Math.hypot(tx, ty) || 1;
                  const ux = tx / len;
                  const uy = ty / len;
                  // Three dots along the tangent
                  return (
                    <g>
                      <circle cx={h.x - ux * 3} cy={h.y - uy * 3} r={1.6} fill="rgb(var(--board-start))" opacity={0.85} />
                      <circle cx={h.x}          cy={h.y}          r={1.8} fill="rgb(var(--board-start))" />
                      <circle cx={h.x + ux * 3} cy={h.y + uy * 3} r={1.6} fill="rgb(var(--board-start))" opacity={0.85} />
                    </g>
                  );
                })()}
                {/* Suit glyph to the LEFT of the start cluster — redundant
                    lane marker so colour isn't the only differentiator.
                    Anchored at a fixed x so the three lanes' glyphs
                    stack cleanly on the left edge. */}
                {(() => {
                  const h = geom.holes[0]!;
                  const dx = -1;
                  const dy = 0;
                  const len = 1;
                  const ox = h.x + (dx / len) * 12;
                  const oy = h.y + (dy / len) * 12;
                  return (
                    <text
                      x={ox}
                      y={oy + 3}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '10px',
                        fill: 'rgb(var(--board-hole-rim))',
                      }}
                      opacity={isEmpty ? 0.45 : 0.9}
                    >
                      {LANE_GLYPH[color]}
                    </text>
                  );
                })()}
              </g>

              {/* Finish (goal) hole 121 — larger, brass-rimmed, with a small
                  numeric label next to it so "this is the finish" is visible
                  without prior cribbage knowledge. */}
              <circle
                data-hole={`${ownerId}-121`}
                data-goal-hole="true"
                cx={geom.holes[HOLES_PER_LANE - 1]!.x}
                cy={geom.holes[HOLES_PER_LANE - 1]!.y}
                r={3.6}
                fill="rgb(var(--board-finish))"
                stroke="rgb(var(--board-bezel))"
                strokeWidth={1}
              />
              {/* "121" glyph — only render for the first lane to avoid
                  triplicate labels overlapping the three stacked finish
                  holes on the left edge. Sits just below the outermost
                  lane's finish. */}
              {laneIdx === 0 && (
                <text
                  x={geom.holes[HOLES_PER_LANE - 1]!.x}
                  y={geom.holes[HOLES_PER_LANE - 1]!.y + 14}
                  textAnchor="middle"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '7px',
                    fontWeight: 600,
                    fill: 'rgb(var(--board-bezel))',
                    letterSpacing: '0.08em',
                  }}
                  aria-hidden
                >
                  121
                </text>
              )}
            </g>
          );
        })}

        {/* ── MILESTONE TICKS (skunk / double-skunk) ───────────────
            Vertical stripe across the three lanes at the middle-lane
            x-position of hole 61 / 91. Labels sit outside the track
            (above if the hole is on the top leg, below on the return
            leg) so they never overlap the lanes. */}
        <g>
          <line
            data-double-skunk-line="true"
            x1={doubleSkunkTick.x1}
            y1={doubleSkunkTick.y1}
            x2={doubleSkunkTick.x2}
            y2={doubleSkunkTick.y2}
            stroke="rgb(var(--board-milestone))"
            strokeWidth={1.2}
            strokeDasharray="2,2"
            opacity={0.85}
          />
          <text
            x={doubleSkunkTick.labelX}
            y={doubleSkunkTick.labelY}
            textAnchor="middle"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '8px',
              fontWeight: 600,
              fill: 'rgb(var(--board-milestone))',
            }}
          >
            {en.table.doubleSkunkLabel}
          </text>
        </g>
        <g>
          <line
            data-skunk-line="true"
            x1={skunkTick.x1}
            y1={skunkTick.y1}
            x2={skunkTick.x2}
            y2={skunkTick.y2}
            stroke="rgb(var(--board-milestone))"
            strokeWidth={1.2}
            strokeDasharray="2,2"
            opacity={0.85}
          />
          <text
            x={skunkTick.labelX}
            y={skunkTick.labelY}
            textAnchor="middle"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '8px',
              fontWeight: 600,
              fill: 'rgb(var(--board-milestone))',
            }}
          >
            {en.table.skunkLabel}
          </text>
        </g>

        {/* ── PEGS ─────────────────────────────────────────────────
            Pegs render last so they sit above every hole + milestone.
            Per-peg <title> tags would be pruned by the outer svg's
            role="img" — score announcements flow through the
            <div role="status"> above instead. */}
        {lanesView.map(({ geom, pegSet }) => {
          if (!pegSet) return null;
          return (
            <g key={`pegs-${pegSet.playerId}`}>
              <CribbagePeg
                playerId={pegSet.playerId}
                pegType="back"
                holes={geom.holes}
                position={pegSet.backPeg}
                color={pegSet.color}
              />
              <CribbagePeg
                playerId={pegSet.playerId}
                pegType="front"
                holes={geom.holes}
                position={pegSet.frontPeg}
                color={pegSet.color}
              />
            </g>
          );
        })}
      </svg>

      {/* Text score readout. Visible to everyone and the authoritative
          fallback for screen readers. */}
      <ul
        className="flex flex-row flex-wrap gap-x-4 gap-y-1 mt-2 px-2 text-sm"
        aria-label={en.table.currentScoresLabel}
      >
        {pegs.map((pegSet) => {
          const name = playerNames[pegSet.playerId] ?? pegSet.playerId;
          return (
            <li key={pegSet.playerId} className="inline-flex items-center gap-2 text-ink-soft">
              <span
                aria-hidden
                className={`inline-block w-2.5 h-2.5 rounded-full ${laneDotColor(pegSet.color)}`}
              />
              <span className="font-display">
                {en.table.scorePoints
                  .replace('{name}', name)
                  .replace('{score}', String(pegSet.frontPeg))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
