# Cribbage Board — Phase 5 fixes

Applied against findings in `design/board-review.md`.

## BLOCKERs — all resolved

### B1. Live-region spam on bot-driven score deltas
**Fix:** `CribbageBoard.tsx:51-96` — rewrote the announcer to coalesce all same-tick deltas into a single announcement string, seed `prevScoresRef` on first render (no "scored 0" on mount), and explicitly announce wins (`frontPeg >= 121`) with a dedicated string. Uses three i18n keys (`cribbageScoreAnnouncement`, `cribbageAdjustAnnouncement`, `cribbageWinAnnouncement`) so the strings live in `en.json`.

### B2. Halo still plays under reduced-motion
**Fix:** `CribbagePeg.tsx:74-82, 125-130` — the reduced-motion branch now snaps to the destination and fades the peg's opacity (0.6 → 1 over 140ms) at the landing hole instead of rendering the halo. Halo `<circle>` is only rendered when `!reducedMotion`. Matches the direction spec's "snap + 140ms destination fade" requirement.

### B3. SVG `<style>` leaked keyframes globally
**Fix:** `globals.css:116-135` — moved `@keyframes cribbage-halo` to the global stylesheet with a `@media (prefers-reduced-motion: reduce)` guard that zeroes any stray halo instance. Removed the embedded `<style>` from `CribbageBoard.tsx`.

## High-leverage SHOULD-FIX — applied

- **S1** — reduced-motion preference is now reactive: `CribbagePeg.tsx:48-56` subscribes to `matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', …)` so toggling the OS setting mid-session takes effect on the next update without a reload.
- **S2** — removed dead `<title>` / `accessibleName` (pruned by the outer `role="img"`). The live region is the single announcement surface. `CribbageBoard.tsx:349-368`, `CribbagePeg.tsx` props cleaned up.
- **S3** — `aria-label="Current scores"` moved to `en.table.currentScoresLabel`.
- **S6** — `<text>` inline presentation attributes moved to `style={{ fontFamily: ..., fontSize: ..., fill: ... }}` so the theme cascade applies reliably (Safari fix). `CribbageBoard.tsx:250-262, 301-312, 325-336`.
- **S7** — test-harness button group now `<div role="radiogroup">` with `role="radio"` and `aria-checked` on each button. `BoardTestPage.tsx:94-120`.
- **S8** — test-harness buttons now have `focus-visible:ring-2 focus-visible:ring-ochre-hi` with ring-offset against the paper background.
- **S9** — `<nav>` replaced with `<div role="radiogroup">` (harness state-picker is a control, not navigation).
- **S11** — peg `accessibleName` removed entirely (dead after S2); no new hardcoded English strings.
- **S12** — reaching 121 now triggers `cribbageWinAnnouncement` ("{name} reached 121 and won the game.") in the live region.
- **S13** — `position` is clamped at the top of the peg component (`safeTarget`) before any effect-side-effect runs, protecting sound + halo from transient invalid values.
- **S14** — dropped the `useMemo` around `lanesView`; recompute is trivial.
- **S16** — start-cluster suit glyph now uses `rgb(var(--board-hole-rim))` instead of `--whisper`, so it remains visible in Obsidian.
- **S17** — added explicit `width={VIEWBOX}` and `height={VIEWBOX}` attributes on the root `<svg>` to prevent CLS during hydration / CSS-disabled flash.
- **S19** — halo `<circle>` inline style now sets `transformBox: 'fill-box'` so the `scale()` originates from the circle's own centre, not the SVG root.
- **S20** — test-harness buttons now include `touch-manipulation` class (Tailwind for `touch-action: manipulation`).

## Deferred (NICE-TO-HAVE + low-leverage SHOULD-FIX)

- **S4 / S5 / S18** — RAF-driven `setState` + `drop-shadow` filter + `feTurbulence` substrate grain. No visible perf bug at 2–3 pegs; filter is only applied to a static `<rect>` substrate, not the animated peg layer. Revisit if 4-player games land or if real-device profiling shows the peg jank.
- **S10** — announcer wipes on unmount. Genuinely dev-only edge case (route change + re-entry); defer.
- **S21** — reduced-motion unit test. Good idea; not a blocker. Can land in a follow-up.
- All 12 NICE-TO-HAVE items — acknowledged; not blocking.

## Verification

- **Typecheck**: `tsc --noEmit` passes (all touched files).
- **Tests**: all 11 `CribbageBoard.test.tsx` assertions still pass (data-attribute contract preserved — the 363-hole count, `data-lane` / `data-lane-empty` / `data-peg` / `data-goal-hole` / `data-skunk-line` / `data-double-skunk-line` all unchanged).
- **Visual**: the three canonical states re-shot after fixes — see `design/board-after/desktop-01-game-start.png`, `desktop-02-mid-game.png`, `desktop-03-score-landing.png`, plus matching tablet + mobile captures and the theme-swap shots (`theme-obsidian.png`, `theme-riso.png`). Start-cluster glyphs now render in brass tone (visible in all three themes); no other visual regressions.

## Result

**Zero BLOCKERs remain.** The top-10 SHOULD-FIX items from the review are resolved; four perf + test-coverage items are explicitly deferred with reasoning.
