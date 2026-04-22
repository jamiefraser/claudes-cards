# Cribbage Board — Phase 4A Responsive / Visual comparison

**Date:** 2026-04-21
**Direction applied:** Heirloom (walnut substrate + brass inlay + engraved groove)
**Method:** Playwright MCP against a dev-only harness at `/_board-test` that renders the board in the three canonical states (game start, mid-game, score landing). Screenshots saved to `design/board-after/`.

---

## Responsive checklist

Measured in the running app at each target viewport.

| Requirement | 375 | 820 | 1440 | Status |
|---|---|---|---|---|
| No horizontal clipping of the board SVG | ✅ board fits | ✅ | ✅ | **PASS** |
| Holes readable (no overlap) | ✅ tight but legible | ✅ | ✅ | **PASS** |
| Lane differentiation by shape/marker, not colour alone | ✅ suit glyphs + start cluster + score-row dot + text | ✅ | ✅ | **PASS** |
| Start cluster vs regular holes distinguishable | ✅ three orange dots + suit glyph | ✅ | ✅ | **PASS** |
| Finish (hole 121) distinguishable | ✅ larger brass-rimmed well at innermost end | ✅ | ✅ | **PASS** |
| Milestone ticks (61 / 91) visible | ✅ `SS` / `S` radial dashed ticks | ✅ | ✅ | **PASS** |
| Animation doesn't overshoot the path | ✅ easeOutCubic, caps at 600ms | ✅ | ✅ | **PASS** |
| `preserveAspectRatio` — board scales without distorting | ✅ `xMidYMid meet` square viewBox | ✅ | ✅ | **PASS** |
| Theme-neutral — works in all three themes | ✅ verified in Salon + Obsidian + Riso | — | — | **PASS** |

*(All hole positions are in pure viewBox units so scaling is lossless; the 375px-wide mobile shot puts the board at ~340px square — the holes read at ~2.1px visible radius which stays above the eye's limit in a UI context.)*

---

## Shots

### State 1 — Game start

All six pegs (3 × front + 3 × back) at hole 0 of their respective lanes — the three coloured pegs sit beside each other at the outer right of the spiral, below the `SS` milestone label. The start-cluster decoration (three orange dots + suit glyph per lane) is visible in the same region.

| Viewport | File |
|---|---|
| Desktop 1440 | `design/board-after/desktop-01-game-start.png` |
| Tablet 820 | `design/board-after/tablet-01-game-start.png` |
| Mobile 375 | `design/board-after/mobile-01-game-start.png` |

### State 2 — Mid-game

Red peg at 28 (outer spiral, left side). Blue peg at 65 (middle spiral). Green peg at 103 (inner spiral, near centre). The story — "further from start → closer to winning" — is readable at a single glance because the peg is literally closer to the centre. The trailing back-pegs sit behind each front peg at the previous-score position.

| Viewport | File |
|---|---|
| Desktop 1440 | `design/board-after/desktop-02-mid-game.png` |
| Tablet 820 | `design/board-after/tablet-02-mid-game.png` |
| Mobile 375 | `design/board-after/mobile-02-mid-game.png` |

### State 3 — Score landing

Red peg mid-sweep from 48 → 62 (scored 14). Blue peg at 70. The landing halo (a fading ring) is visible around the red front peg in the tablet shot. The back peg trails at 48, so you see two reds — the eye reads the gap as "this player just scored."

| Viewport | File |
|---|---|
| Desktop 1440 | `design/board-after/desktop-03-score-landing.png` |
| Tablet 820 | `design/board-after/tablet-03-score-landing.png` |
| Mobile 375 | `design/board-after/mobile-03-score-landing.png` |

### Bonus — theme swap

Same mid-game state rendered in Obsidian Club and Bodega Riso to confirm the board consumes theme tokens correctly:

| Theme | File |
|---|---|
| Obsidian | `design/board-after/theme-obsidian.png` — near-black oak, acid-chartreuse brass glow, ember peg colour |
| Riso | `design/board-after/theme-riso.png` — warm sycamore, tomato brass, mustard group-of-5 rims |

---

## Audit findings addressed (from Phase 1)

| Finding from `board-audit.md` | Status in the new code |
|---|---|
| 7.1 — straight-line CSS transition | **Replaced** with RAF animator that interpolates along the same arc-length hole array used to place holes (`CribbagePeg.tsx:77-112`). |
| 7.2 — aspect-ratio mismatch from `max-h-[200px]` | **Removed** — new board uses `viewBox` + `preserveAspectRatio="xMidYMid meet"` with no max-height. |
| 7.3 — `prefers-reduced-motion` gap | **Fixed** — reduced-motion branch snaps to destination and pulses a 220ms halo (`CribbagePeg.tsx:49-60`). |
| 7.4 — test tolerance for geometry | **Preserved** — 121 holes per lane × 3 lanes = 363 first-class `<circle data-hole>` elements, existing 11 tests pass unchanged. |
| 7.5 — skunk markers on a curve | **Single radial tick at the middle-lane angle** passes the `getByText('S')` / `getByText('SS')` assertions and reads as one stripe across all three lanes. |
| 7.6 — coordinate origin | **Fixed** — `lanes[laneIdx].holes[holeIdx]` is length 122 (0..121), drop-in with `frontPeg` / `backPeg` indices. |

Plus:

- **`var(--x)` vs `rgb(var(--x))` on SVG fill** — tokens are RGB triplets, so `var()` alone produces invalid colour strings. I caught this during the first screenshot probe (`fill: "rgb(0, 0, 0)"`), fixed by wrapping every colour reference in `rgb(...)` and moving peg colours to `style` (where CSS `var()` reliably resolves).
- **Live-region announcements** — root has `<div role="status" aria-live="polite" class="sr-only">` that updates on score deltas (`CribbageBoard.tsx:66-84`). Announcement template: "Alice scored 14, now at 62."
- **Peg `<title>` children** — each peg circle has a `<title>` with "{name} peg, hole N of 121" so screen-reader exploration works.

---

## File manifest

New files:
- `apps/frontend/src/components/table/cribbage/spiralGeometry.ts` — pure geometry, no React.
- `apps/frontend/src/pages/BoardTestPage.tsx` — dev-only harness at `/_board-test`.

Rewritten:
- `apps/frontend/src/components/table/cribbage/CribbageBoard.tsx` — spiral rendering.
- `apps/frontend/src/components/table/cribbage/CribbagePeg.tsx` — along-path RAF animator.

Touched:
- `apps/frontend/src/styles/tokens.css` — added `--board-*` token block per theme.
- `apps/frontend/src/App.tsx` — single route add for `/_board-test`.

Untouched (as designed):
- `packages/shared-types/src/gameState.ts` — data shape unchanged.
- `apps/socket-service/src/games/cribbage/engine.ts` — scoring unchanged.
- `apps/frontend/__tests__/CribbageBoard.test.tsx` — all 11 tests still pass without modification.
- `apps/frontend/src/components/table/GameTable.tsx` — parent wiring unchanged.

---

## Result

Subagent A (this report) reports **no responsive issues**: no clipping at any viewport, holes readable everywhere, lane differentiation redundant (colour + suit glyph + text + score-row dot), animation bounded and reduced-motion-safe, all three themes render correctly.

Pending: Subagent B's web-design-guidelines audit output (running in the background — will fold its blockers into Phase 5).
