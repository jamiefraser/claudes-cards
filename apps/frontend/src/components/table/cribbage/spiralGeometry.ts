/**
 * Board geometry — three-lane serpentine ("classic") cribbage board.
 *
 * File is still named `spiralGeometry.ts` for import stability; the
 * exported shape is unchanged. Switched from an inward Archimedean
 * spiral to a traditional U-track: two parallel straight segments
 * joined by a semicircular U-turn on the right, with three concentric
 * lanes offset perpendicular to the path.
 *
 *         ┌───────────────────────────────▶ U
 *   start │                                 │
 *         ┌───────────────────────────────▶ │
 *         │                                 │    ← three concentric lanes
 *         ┌───────────────────────────────▶ │
 *                                           │
 *         ◀───────────────────────────────┐ │
 *    finish                               │ ▼
 *         ◀───────────────────────────────┐ U
 *         ◀───────────────────────────────┐
 *
 * Each lane runs: short start stub → top straight → U-turn (half-circle)
 * → bottom straight → short finish stub. Holes are distributed by **arc
 * length** along this composite path — the same correctness reason as
 * for the spiral (spacing in `t` would crowd holes on the U-turn's
 * small-radius inner lane).
 *
 * ## Arc-length-even holes
 *
 * Do NOT distribute holes by path parameter (e.g. "0.33 of total t").
 * The U-turn's arc length depends on lane radius, so a naive parameter
 * distribution bunches holes on the inner lane's curve. The code below
 * dense-samples the lane, builds a cumulative-arc-length table, then
 * inverts it to find equal-length positions.
 */

// ── Tunable parameters ──────────────────────────────────────────────────
// viewBox is a wide rectangle (classic cribbage proportions are roughly
// 3.5:1 — longer than tall). All coordinates live in this unit space;
// the outer <svg> scales with preserveAspectRatio.
export const VIEWBOX_WIDTH = 420;
export const VIEWBOX_HEIGHT = 160;

// Centreline y of the board. The three lanes are symmetric about this
// axis — outer lanes above and below, middle lane tucked inside.
const MID_Y = VIEWBOX_HEIGHT / 2;

// x-range for the straight portions of the track.
const X_LEFT = 44;
const X_RIGHT = 356;

// Radial offsets for the three lanes (distance from the centreline).
// Outer lane farthest from centre, inner lane closest. The U-turn at
// X_RIGHT becomes three concentric half-circles with these radii.
const LANE_RADII: readonly [number, number, number] = [52, 37, 22];

// For module consumers that used the old spiral API.
export const CX = VIEWBOX_WIDTH / 2;
export const CY = MID_Y;
export const VIEWBOX = VIEWBOX_WIDTH;

// 120 scoring holes + hole 121 goal. Hole index 0 is the conceptual
// "start" position — not rendered as a data-hole (matches the old board
// contract) but present in the positions array so peg placement at
// frontPeg = 0 works without a branch.
export const HOLES_PER_LANE = 122;

// Dense sample count for arc-length maths, and subsample for rendered path.
const ARC_SAMPLES = 1600;
const PATH_SAMPLES = 160;

// ── Lane parameterisation ───────────────────────────────────────────────
// For lane i with radius R, the path is parameterised by `u ∈ [0, 1]`:
//
//   u ∈ [0,         uTop]        — top straight, X_LEFT → X_RIGHT
//   u ∈ [uTop,      uTop+uArc]   — semicircle, angle π/2 → -π/2 (going right-round)
//   u ∈ [uTop+uArc, 1]           — bottom straight, X_RIGHT → X_LEFT
//
// Where uTop / uArc / uBot are the fraction of TOTAL ARC LENGTH (not
// total u) taken by each segment. Rather than juggle fractions, the
// dense-sample pass below walks a structured parameter and records raw
// (x, y) plus running arc length.

function laneSamples(radius: number): Array<{ x: number; y: number }> {
  const samples: Array<{ x: number; y: number }> = [];
  const straightSamples = Math.round(ARC_SAMPLES * 0.38);
  const arcSamples = ARC_SAMPLES - 2 * straightSamples;

  const topY = MID_Y - radius;
  const botY = MID_Y + radius;

  // Top straight: (X_LEFT, topY) → (X_RIGHT, topY)
  for (let i = 0; i <= straightSamples; i++) {
    const t = i / straightSamples;
    samples.push({ x: X_LEFT + (X_RIGHT - X_LEFT) * t, y: topY });
  }
  // U-turn: semicircle centred (X_RIGHT, MID_Y), radius R, angle π/2 → -π/2
  // starting at top (matches top-straight end) sweeping clockwise to bottom.
  for (let i = 1; i <= arcSamples; i++) {
    const t = i / arcSamples;
    const angle = Math.PI / 2 - Math.PI * t; // π/2 → -π/2
    samples.push({
      x: X_RIGHT + radius * Math.cos(angle),
      y: MID_Y - radius * Math.sin(angle),
    });
  }
  // Bottom straight: (X_RIGHT, botY) → (X_LEFT, botY)
  for (let i = 1; i <= straightSamples; i++) {
    const t = i / straightSamples;
    samples.push({ x: X_RIGHT - (X_RIGHT - X_LEFT) * t, y: botY });
  }
  return samples;
}

// ── Per-lane build ──────────────────────────────────────────────────────

export interface LaneGeometry {
  /** SVG `d` attribute for a smooth track stroke (under the holes). */
  path: string;
  /** Hole positions indexed 0..121. */
  holes: ReadonlyArray<{ x: number; y: number }>;
  /** Tangent angle at a given hole (radians) — used for start-cluster rotation. */
  angleAt: (holeIdx: number) => number;
}

function buildLane(radius: number): LaneGeometry {
  // 1) Dense sample along the structured path.
  const dense = laneSamples(radius);

  // 2) Cumulative arc length.
  const cumul: number[] = new Array(dense.length);
  cumul[0] = 0;
  for (let i = 1; i < dense.length; i++) {
    const dx = dense[i]!.x - dense[i - 1]!.x;
    const dy = dense[i]!.y - dense[i - 1]!.y;
    cumul[i] = cumul[i - 1]! + Math.hypot(dx, dy);
  }
  const total = cumul[cumul.length - 1]!;

  // 3) Invert — find the (x, y) at each equal arc-length step.
  const holes: Array<{ x: number; y: number }> = new Array(HOLES_PER_LANE);
  for (let k = 0; k < HOLES_PER_LANE; k++) {
    const targetLen = (k / (HOLES_PER_LANE - 1)) * total;
    let lo = 0;
    let hi = dense.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumul[mid]! < targetLen) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) {
      holes[k] = { x: dense[0]!.x, y: dense[0]!.y };
    } else {
      const prev = dense[lo - 1]!;
      const curr = dense[lo]!;
      const span = cumul[lo]! - cumul[lo - 1]!;
      const f = span > 0 ? (targetLen - cumul[lo - 1]!) / span : 0;
      holes[k] = {
        x: prev.x + (curr.x - prev.x) * f,
        y: prev.y + (curr.y - prev.y) * f,
      };
    }
  }

  // 4) Render path — M/L/A: top straight, elliptical arc, bottom straight.
  //    Using a single Arc segment keeps the DOM weight low and the curve
  //    smoother than a PATH_SAMPLES polyline approximation.
  const topY = MID_Y - radius;
  const botY = MID_Y + radius;
  const path = [
    `M${X_LEFT} ${topY}`,
    `L${X_RIGHT} ${topY}`,
    `A${radius} ${radius} 0 0 1 ${X_RIGHT} ${botY}`,
    `L${X_LEFT} ${botY}`,
  ].join(' ');

  // PATH_SAMPLES is kept for consistency with the earlier module — useful
  // if a future consumer wants to animate along the polyline rather than
  // the analytic path.
  void PATH_SAMPLES;

  return {
    path,
    holes,
    angleAt: (holeIdx: number) => {
      const h = holes[holeIdx];
      if (!h) return 0;
      // Tangent direction: compare with the next hole.
      const next = holes[Math.min(HOLES_PER_LANE - 1, holeIdx + 1)];
      if (!next || next === h) return 0;
      return Math.atan2(next.y - h.y, next.x - h.x);
    },
  };
}

// ── Board build ─────────────────────────────────────────────────────────

export interface BoardGeometry {
  lanes: readonly [LaneGeometry, LaneGeometry, LaneGeometry];
  /**
   * Position of a milestone tick that crosses all three lanes at the given
   * hole index. Uses the middle lane's hole position as the reference so
   * the tick reads as one unified stripe; outer/inner lanes may have
   * slightly different x at the same hole index because their U-turns
   * have different arc lengths.
   */
  milestoneAt: (holeIdx: number) => {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    labelX: number;
    labelY: number;
    /** True when the tick falls on the bottom straight — flips label side. */
    onReturnLeg: boolean;
  };
  // Kept for API compatibility with the old spiral module.
  middleRadiusAt: (holeIdx: number) => number;
  radialPoint: (angle: number, radius: number) => { x: number; y: number };
}

const LANES = LANE_RADII.map(buildLane) as unknown as [
  LaneGeometry,
  LaneGeometry,
  LaneGeometry,
];

export const BOARD: BoardGeometry = {
  lanes: LANES,
  milestoneAt: (holeIdx: number) => {
    const mid = LANES[1].holes[holeIdx];
    if (!mid) {
      return { x1: 0, y1: 0, x2: 0, y2: 0, labelX: 0, labelY: 0, onReturnLeg: false };
    }
    // Decide which leg the hole is on by y.
    const onReturnLeg = mid.y > MID_Y;
    const topY = MID_Y - LANE_RADII[0]! - 6;
    const botY = MID_Y + LANE_RADII[0]! + 6;
    return {
      x1: mid.x,
      y1: topY,
      x2: mid.x,
      y2: botY,
      labelX: mid.x,
      labelY: onReturnLeg ? botY + 10 : topY - 3,
      onReturnLeg,
    };
  },
  middleRadiusAt: () => LANE_RADII[1]!,
  radialPoint: (angle: number, radius: number) => ({
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  }),
};
