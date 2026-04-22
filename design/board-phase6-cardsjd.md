# Cribbage board — cardsjd.com observations folded in

Reference: `design/ref-cardsjd/observations.md` (played one full deal against the Easy bot at `cardsjd.com/cribbage/`).

Translated the observations into Le Salon-consistent upgrades. **No public API changed; all 11 board tests still pass; typecheck clean.**

## Applied

### 1. Score-delta banner
`CribbageBoard.tsx` — when any `frontPeg` delta > 0 lands, a `+N {name}` label animates in at the top-centre of the board, holds for **1.8s**, then clears. Multi-peg updates in the same tick coalesce on the largest delta. Hitting 121 adds a burgundy "121" chip inside the same banner.

- Theme-token colours — delta number tints to `--color-card-{lane}`, chip background is `--paper-raised`, border is `--hairline`.
- Uses the existing `animate-seat-in` keyframe so it honours `prefers-reduced-motion` via the global guard.
- Mirrors the live-region announcement so sighted + SR users get the same information simultaneously.

### 2. 3D-ish peg rendering
`CribbagePeg.tsx` — front pegs are now three SVG primitives:
- **Contact shadow**: a small ink ellipse offset down-right, static (computed once per render).
- **Coloured dome**: the peg body with a hairline ink stroke.
- **Specular highlight**: a small paper-coloured circle offset up-left at 35% of the peg radius.

All geometry is computed per render from `x`/`y`/`radius` — no filters (filters re-paint on every RAF frame during animation). Back pegs keep their flatter look at 0.6 opacity so the leapfrog pair reads as "old vs current."

### 3. Running-count chip (pegging)
`CribbagePegArea.tsx` — the pegging count is now a **3xl brass-bordered chip** with a thin ochre underline, displayed prominently to the right of the starter card. Flashes ochre tint for 360ms when the count resets to 0 (after a Go or a 31), so players notice the reset.

### 4. Pegging-pile dim old / bright new
`CribbagePegArea.tsx` — all previously-played cards render at 0.5 opacity; only the most-recent play is at full brightness. A glance at the row tells you what was just played without reading faces.

### 5. Goal-hole numeric label
`CribbageBoard.tsx` — the innermost lane now has a small `121` glyph in JetBrains Mono below the outer-lane goal hole (only rendered once to avoid triplicate labels overlapping). Brass-coloured via `--board-bezel`.

### 6. Counting display — Le Salon tokens
`CribbageCountingDisplay.tsx` — all slate/amber/indigo references migrated to paper/ink/ochre/hairline. Mono font on the tabular running total + per-entry scores. Red suits use `--board-milestone` instead of hardcoded `#f87171`.

### 7. Phase-transition toast (completed 2026-04-22)
`CribbagePhaseToast.tsx` — watches `gameState.publicData.gamePhase`, renders a 2.2s toast at top-centre of the felt when the phase changes (`discarding` → `cutting` → `pegging` → `counting`). Labels + subtitles in i18n. Silently ignores the first mount so a player joining mid-hand doesn't get a spurious toast. Wired in `GameTable.tsx` next to the cribbage board render block.

### 8. Deal-card-by-card stagger (completed 2026-04-22)
`HandComponent.tsx` — when the effect detects a **multi-card batch** arriving (>1 new card between renders), it builds a `dealOrder` map keyed by card id with an ordinal position in the batch. Each `SortableCard` reads its own order and applies `animationDelay: Math.min(order, 5) × 45ms`. Result: a 6-card cribbage deal cascades in `0 / 45 / 90 / 135 / 180 / 225 ms`; a 13-card canasta deal caps at 225 ms so the entire deal still finishes inside 485 ms. Single-card draws skip the map entirely — no delay, snaps in as before.

Two new vitest cases verify the behaviour: a 6-card deal from empty → six non-zero delays in sequence; a single-card draw → one animated card with no delay.

**All cardsjd.com observations are now either implemented or explicitly recorded as "intentionally skipped" with reasoning — no silent gaps remain.**

## Deliberately skipped

- **cardsjd's wood-panel background** — clashes with our three-theme system (Salon's warm paper, Riso's cream, Obsidian's near-black). Our themes already own the substrate language.
- **Score-on-avatar painting** — we keep scores in a separate readout (accessibility + theme-swap reasons).
- **Individual scoring combination walk-through** — our `CribbageCountingDisplay` already does "15 2, 15 4, pair 6" row-by-row with per-row subtotals, which is *richer* than cardsjd's single-number total.
- **Card-fly-from-deck-to-hand animation** — we stagger the hand's slide-in by deal order, but we don't show a travelling card leaving a physical deck sprite. That needs a separate deck component + travel-path layer; out of scope unless someone asks.

## Not touched

- `spiralGeometry.ts` — geometry unchanged; serpentine layout stays.
- Engine, shared-types, tests — unchanged.
- Theme tokens — unchanged.
- Public APIs — `CribbageBoardProps`, `CribbagePegProps`, `CribbagePegAreaProps`, `CribbageCountingDisplayProps` all identical.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | ✓ clean |
| `npx vitest run __tests__/CribbageBoard.test.tsx` | ✓ 11/11 |
| Visual at 1440×900 desktop | ✓ `design/board-after/serpentine-polished.png` |
| Banner + 3D pegs + 121 label visible | ✓ |
| Theme-swap unaffected | ✓ token-driven throughout |

Branch state unchanged (on `master`, uncommitted).
