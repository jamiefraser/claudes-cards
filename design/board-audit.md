# Cribbage Board — Phase 1 Audit

**Date:** 2026-04-21
**Scope:** Understanding the existing board component before swapping the geometry from horizontal 3-lane pegboard to a three-lane inward spiral.
**Outcome:** The public API is preservable. No blockers. A few pre-existing items flagged with proposed solutions.

---

## 1. Where the board lives

### 1.1 Rendering component
- **`apps/frontend/src/components/table/cribbage/CribbageBoard.tsx`** — the full board SVG. Single file, 306 lines.
  - `viewBox` is fixed at **720 × (≈116)** — 4.5:1 horizontal slab (`VIEWBOX_WIDTH = 720`, height computed from lane count at `CribbageBoard.tsx:103`).
  - Three parallel horizontal lanes, each with 120 small holes + 1 goal hole — **363 holes total** (`CribbageBoard.tsx:180-207`).
  - Skunk dashed line at hole 91, double-skunk at hole 61 (`CribbageBoard.tsx:212-254`).
  - Wood-grain `feTurbulence` filter + two nested `<rect>` for substrate (`CribbageBoard.tsx:121-162`).
  - Below-board text scores for screen readers (`CribbageBoard.tsx:287-303`).
- **`apps/frontend/src/components/table/cribbage/CribbagePeg.tsx`** — single-peg SVG `<circle>`. 76 lines.
  - Takes `x`, `y`, `color`, `position`, `pegType: 'front' | 'back'`.
  - Animates via **CSS transition** `cx 0.4s ease, cy 0.4s ease` (`CribbagePeg.tsx:67-68`).
  - Triggers `peg-move` sound on front-peg position change (`CribbagePeg.tsx:48-53`).

### 1.2 Consumer
- **`apps/frontend/src/components/table/GameTable.tsx:974-981`** — the only render site.
  ```tsx
  {isCribbage && gameState.cribbageBoardState && (
    <div className="w-full max-w-2xl">
      <CribbageBoard
        boardState={gameState.cribbageBoardState}
        playerNames={playerNames}
      />
    </div>
  )}
  ```
  Passes the whole `cribbageBoardState` + `Record<playerId, displayName>`. No other prop surface.

### 1.3 State source
- **`apps/frontend/src/store/gameStore.ts:113`** — `cribbageBoardState` is read off `GameState` and passed through untouched on every `game_state_delta`.
- **`packages/shared-types/src/gameState.ts:124-147`** — the canonical type:
  ```ts
  interface CribbageBoardState {
    pegs: CribbagePegSet[];         // 2–3 players
    skunkLine: 91;
    doubleskunkLine: 61;
    winScore: 121;
  }
  interface CribbagePegSet {
    playerId: string;
    color: 'red' | 'green' | 'blue';   // assigned by seat index
    frontPeg: number;               // 0–121, current score position
    backPeg: number;                // 0–121, previous score position
  }
  ```

### 1.4 Engine (for reference — not touched)
- **`apps/socket-service/src/games/cribbage/engine.ts:247-251`**:
  ```ts
  pegSet.backPeg = pegSet.frontPeg;
  pegSet.frontPeg = Math.min(121, newScore);
  ```
  "back peg leaps over the front" convention — front is the latest total, back is the previous total. The redesign preserves this because the spiral indices are the same 0–121 domain.

---

## 2. Score → peg position

The mapping is **purely index-based**: `frontPeg` / `backPeg` are hole indices in `[0, 121]` where `0` = start cluster, `121` = goal.

The current layout converts index → `(x, y)` via `holeX(n)` / `laneY(laneIdx)` (`CribbageBoard.tsx:45-82`). In the spiral version, the conversion becomes a lookup into a pre-computed `lanes[laneIdx].holes[n]` array of `{x, y}` positions, generated once at module load from the spiral formula with arc-length-even sampling. **No engine change, no data-shape change** — only the index-to-coordinate function changes.

Seat ↔ colour mapping is fixed in the engine (`seat 0 = red, 1 = blue, 2 = green` — `shared-types/gameState.ts:141-142`). Preserve.

---

## 3. Public API (what we must not break)

```tsx
export interface CribbageBoardProps {
  readonly boardState: CribbageBoardState;
  readonly playerNames: Record<string, string>;
}
```

That's it. No callbacks, no refs, no imperative handles. **This is completely preservable.** The spiral implementation keeps the exact same signature and just regenerates hole coordinates internally.

---

## 4. Animation / state transitions on peg movement

- **Position updates** flow from server → `gameStore.cribbageBoardState` → re-render of the board. No local animation state — the CSS transition on `<circle cx/cy>` interpolates between renders.
- **Transition curve**: `cx 0.4s ease, cy 0.4s ease` (`CribbagePeg.tsx:67-68`). A straight line from old position to new position at 400ms.
- **Sound**: `peg-move` played when `position` changes and it's the front peg (`CribbagePeg.tsx:48-53`).
- **No `prefers-reduced-motion` guard** on the transition — spec says it should honour OS preference (see §7).

---

## 5. Tests that must keep passing

**`apps/frontend/__tests__/CribbageBoard.test.tsx`** — 10 tests, all DOM/role/attribute assertions:

| Assertion | Line | Spiral compatibility |
|---|---|---|
| `getByRole('img', { name: 'Cribbage scoring board' })` | 47 | ✓ Keep `aria-label={en.table.cribbageBoardAriaLabel}` on the root SVG |
| `getByText('Alice: 0 points')` etc. | 54–55 | ✓ Preserve the below-board text scores |
| `container.querySelectorAll('circle[data-hole]').length === 363` | 67, 75 | ✓ Spiral still renders 3 × 121 circles with `data-hole="${owner}-${n}"` |
| `container.querySelector('[data-skunk-line]')` + `getByText('S')` | 82–83 | ✓ Render `<g data-skunk-line>` at the arc position of hole 91 with a glyph; glyph can be an SVG `<text>` as today |
| `container.querySelector('[data-double-skunk-line]')` + `getByText('SS')` | 90–91 | ✓ Same pattern at hole 61 |
| `container.querySelector('[data-goal-hole]')` | 98 | ✓ Hole 121 still marked `data-goal-hole="true"` |
| `container.querySelector('[data-peg="player-1-front"]')` + back | 115–116 | ✓ Preserve `data-peg` attributes on peg circles |
| `[data-lane]` count === 3; `:not([data-lane-empty])` count === active players | 123–134 | ✓ Three `<g data-lane>` elements, empty lanes flagged `data-lane-empty` |
| Text score reflects `frontPeg` | 149–150 | ✓ Same below-board text |

**Regression risk: low.** Every assertion is addressable by keeping the data attributes + text content identical.

---

## 6. i18n strings in play

- `en.table.cribbageBoardAriaLabel` — SVG root aria-label
- `en.table.scorePoints` — `"{name}: {score} points"` below-board text
- `en.table.skunkLabel` — `"S"`
- `en.table.doubleSkunkLabel` — `"SS"`

New strings the spiral redesign likely needs (will add in Phase 3): `startClusterLabel` ("Start"), `finishLabel` ("121"), peg announcement template ("`{name} peg, hole {n} of 121`").

---

## 7. Things that will make the spiral swap harder than it should be — and how I'll handle each

### 7.1 Straight-line CSS transition vs. curved path
**Problem.** `cx/cy 0.4s ease` will interpolate a straight chord through the spiral — so a peg that scores 6 points near the outer revolution appears to cut across empty wood rather than follow the groove.

**Solution I'll use in Phase 3.** Drive the along-path motion from the same arc-length lookup that places the holes. Options:
- **(a)** SVG-native `<animateMotion><mpath href="#lane-N-path"/></animateMotion>` keyed off score deltas — zero new deps, native reduced-motion friendly. Tricky to retrigger on each update without React/SVG fighting.
- **(b)** RAF-driven JS: for each score change, interpolate `t` along the lane and set `cx/cy` per frame; skip if `prefers-reduced-motion`. ~40 lines; no dependency.
- **(c)** Install `motion` (~20KB) and use its `animate()` with a custom path-follower.

I'll default to **(b)**, a small internal RAF animator, because it composes cleanly with React props-driven renders and the brief explicitly permits "CSS-only if the app is plain HTML" — this isn't, but the logic is tiny. I'll confirm in Phase 3 before writing if you'd rather I pull in `motion`.

### 7.2 Aspect ratio change
**Problem.** Current `viewBox` is 720 × ~116 (wide & short). A spiral is closest to square. If the consumer wrapper (`max-w-2xl` = 672px) has no height cap, the board will leap from ~110px tall to ~670px — which is desired on desktop, but in the felt context on mobile there's a `max-h-[200px]` inline style (`CribbageBoard.tsx:119`) that will squash a spiral.

**Solution.** Drop the `max-h-[200px]` inline style (it belongs to the old horizontal shape). The new component uses `viewBox` + `preserveAspectRatio="xMidYMid meet"` and inherits width from parent; the parent wrapper (`max-w-2xl`) constrains the width sensibly. If the felt layout needs a separate height cap on mobile, that's a one-line tweak in `GameTable.tsx` — I'll raise it in Phase 3 if I see it.

### 7.3 `prefers-reduced-motion` gap
**Problem.** `CribbagePeg.tsx:67-68` uses a plain CSS transition with no media-query guard. The global `tokens.css` already zeroes out transitions for reduced-motion users, but it does so with `transition-duration: 1ms` — which works for the current straight-line chord but won't "gracefully degrade" a spiral animation the way the brief wants ("snap to destination with a brief fade on the destination hole").

**Solution.** In the new peg component, branch on `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and pick between "along-path RAF animator" and "snap + 120ms destination fade". Clean, isolated.

### 7.4 Test tolerance for geometry
**Problem.** Tests don't assert hole coordinates (good) but do count `[data-hole]` circles. If I use SVG `<use>` to instance the same hole template, `querySelectorAll('circle[data-hole]')` might return fewer nodes.

**Solution.** Keep 363 first-class `<circle>` elements. At 120 holes × 3 lanes the perf delta from `<use>` instancing is not meaningful; the current board does the same.

### 7.5 Skunk / double-skunk markers in a curved path
**Problem.** Today the markers are vertical dashed lines across all three lanes at the same `x`. On a spiral, "hole 91" is a different angular position per lane (the offset between lanes is small, but not zero).

**Solution.** Draw the marker as a short radial tick through all three lane radii at the **middle lane's** angle for hole 91 (and 61). The tick crosses all three lanes at once, reading as a single "milestone stripe." Label `S`/`SS` still passes tests via `getByText`. If that reads weird visually, the Phase 2 direction can propose a subtler marker (engraved chevron, brass pin, compass mark).

### 7.6 Coordinate-origin differences
**Problem.** The existing component uses hole index `0` for start and counts up to `121`. Engine seeds `frontPeg: 0` (`engine.ts:260`). The spiral maths below describe a parametric range `t ∈ [t0, t1]` — I need the mapping to be explicit: `hole 0` → outermost; `hole 121` → innermost (or a designated goal cluster).

**Solution.** Precompute an array `lanePositions[laneIdx][holeIdx]` of length 122 (holes 0–121). Entry 0 is the start cluster, entries 1–120 are arc-length-evenly spaced along the spiral, entry 121 is the goal. This keeps `frontPeg` / `backPeg` drop-in.

---

## 8. Summary

| Item | Status |
|---|---|
| Public API (`CribbageBoardProps`) | **Preservable as-is** |
| Engine / state shape | **Preservable as-is** |
| Existing tests | **All 10 keep passing** with the data-attribute contract preserved |
| i18n keys | Add 2–3 new keys for start/finish/peg-announcement; don't touch the existing 4 |
| Parent wrapper in GameTable.tsx | **No change required** (brief rule 2 honoured). I'll flag if the mobile felt layout needs an adjustment once Phase 3 lands. |
| Animation | Replace the CSS transition with a small path-following animator + reduced-motion branch — local to the board, no deps |

**Nothing is blocking Phase 2.** Stopping here for your approval of the audit before I propose visual directions.
