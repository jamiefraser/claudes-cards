# Cribbage Board — Phase-4 Design Review

**Date:** 2026-04-21
**Scope:** Audit of the three-lane inward-spiral cribbage board against the Vercel Web Interface Guidelines, WAI-ARIA SVG patterns, and the motion/theme rules established in `board-audit.md` / `board-directions.md`.
**Sources reviewed:**
- `apps/frontend/src/components/table/cribbage/CribbageBoard.tsx`
- `apps/frontend/src/components/table/cribbage/CribbagePeg.tsx`
- `apps/frontend/src/components/table/cribbage/spiralGeometry.ts`
- `apps/frontend/src/pages/BoardTestPage.tsx`
- `apps/frontend/src/styles/tokens.css` (board blocks only)
- `apps/frontend/__tests__/CribbageBoard.test.tsx`
- `apps/frontend/src/App.tsx` (`/_board-test` route)

Categories: **BLOCKER** (ship-stopping), **SHOULD-FIX** (address before merge), **NICE-TO-HAVE** (low-cost polish).

---

## BLOCKER

### B1. `role="status"` live region is emitted by bot-driven state changes without filtering — will announce on remote-user score deltas even when the local user isn't meant to be notified

`CribbageBoard.tsx:98-100, 56-70`
The announcer fires for every `frontPeg` delta across *all* pegs, including bots. With 2–3 opponents scoring in rapid succession, screen-reader users will hear a stream of announcements that can't be silenced mid-sweep (no `aria-atomic` control, no dedup, no throttle). Combined with `peg-move` sound firing per front-peg (`CribbagePeg.tsx:63`), a 14-point count can trigger ~6 overlapping announcements plus 6 sound events for a single turn. Add a debounce (coalesce deltas within one RAF tick) and skip bot-flagged players.

### B2. `@keyframes cribbage-halo` is not guarded by `prefers-reduced-motion`; halo still plays in reduced-motion path

`CribbageBoard.tsx:137-142` defines the halo keyframes globally (they leak via SVG `<style>` with no scope). `CribbagePeg.tsx:66-72` (reduced-motion branch) *sets* `haloAt` and thus renders the `<circle>` at `CribbagePeg.tsx:130-145`, which runs the 220 ms `cribbage-halo` animation via inline `style={{ animation: ... }}`. The global `tokens.css:286-295` reduced-motion override only clamps `animation-duration: 1ms` — which plays a *compressed* pulse rather than suppressing it. Either gate the halo render behind `!prefersReducedMotion()` OR switch the reduced-motion branch from "halo" to "snap + 140 ms destination *fade*" as the direction spec calls for (`board-directions.md` §Heirloom motion).

### B3. SVG `<style>` block is not scoped — keyframes leak globally and collide on remount

`CribbageBoard.tsx:137-142` emits `@keyframes cribbage-halo` inside `<defs><style>...</style></defs>`. SVG embedded `<style>` elements become **document-level** CSS in HTML5; every board instance re-registers the same `@keyframes` rule, and the definition is invisible to the global `prefers-reduced-motion` guard because it's injected at render time. Move the keyframes to `globals.css` (the comment on line 134 already claims this is the intent, but the code does not match) and add a `@media (prefers-reduced-motion: reduce) { ... opacity: 0; animation: none; }` branch.

---

## SHOULD-FIX

### S1. `prefers-reduced-motion` media query is read once per effect, not reactive to OS preference changes

`CribbagePeg.tsx:34-37, 66` — `prefersReducedMotion()` is called inside the `useEffect` body each score-change, but users who toggle the OS setting mid-session won't see the change take effect until the next `position` update (and even then, only the branch is picked at that moment — any in-flight RAF continues). Add a `matchMedia(...).addEventListener('change', ...)` listener that cancels the active RAF and snaps.

### S2. SVG `role="img"` + `aria-label` works, but `<title>` on peg circles nested in `<g>` is not associated with the outer `role="img"` — SR will not read peg names

`CribbageBoard.tsx:102-108`, `CribbagePeg.tsx:160` — The outer `<svg role="img" aria-label="Cribbage scoring board">` makes the whole SVG a single accessible node; per WAI-ARIA SVG practice, child `<title>` elements inside `<circle>` are ignored because the `img` role prunes descendants from the accessibility tree. The `accessibleName` prop on each peg (lines 344/352) is consequently dead code for screen readers. Either (a) remove `role="img"` and add `<title>` + `<desc>` as the *first children* of the `<svg>`, or (b) keep `role="img"` and rely on the live-region `<div role="status">` (B1) as the sole announcement surface — in which case the `<title>` on pegs should be removed and `accessibleName` deleted to avoid dead code.

### S3. `aria-label="Current scores"` on the `<ul>` is not in i18n

`CribbageBoard.tsx:364` — hardcoded English string. Violates Absolute Rule 10 (all user-facing strings in `src/i18n/en.json`). Add a key (e.g. `table.currentScoresLabel`).

### S4. Peg `<circle>` uses `filter: drop-shadow(...)` unconditionally — non-compositor-friendly and allocates on every RAF frame

`CribbagePeg.tsx:155-157` — `drop-shadow` is a paint-time filter, not compositor-accelerated. Combined with the RAF loop that re-renders the peg at 60 fps by changing `cx`/`cy` (via React state → new SVG attrs), the filter is recomputed every frame. Vercel guideline: "Animate `transform`/`opacity` only (compositor-friendly)." Move the peg into a `<g transform="translate(x, y)">` wrapper and animate the wrapper's `transform` via CSS/Web Animations API, or pre-render the shadow as a second `<circle>` sibling with a `fill` + blur filter (single paint per mount).

### S5. SVG `<rect>` substrate uses `filter="url(#cribbage-grain)"` with a feTurbulence that is non-deterministic across browsers and runs on every repaint

`CribbageBoard.tsx:154` — `feTurbulence` is re-rasterised whenever the SVG repaints (e.g. when a peg moves and forces a layer invalidation under it). On Safari iOS this is particularly expensive. Either convert the grain to a static raster PNG data-URI (`<image>`) or apply the filter to a *separate* non-animating layer using a CSS `contain: paint` / `will-change: transform` hint to isolate the peg paint.

### S6. `<text>` elements use inline `fontFamily` / `fontSize` / `fontWeight` attributes — not theme-aware and not SSR-safe

`CribbageBoard.tsx:252-253, 298-300, 321-324` — SVG `fontFamily="var(--font-display)"` is a CSS-property *value*, but `fontFamily` as an SVG *attribute* (with React camelCase) maps to the presentation attribute `font-family`, which does evaluate CSS vars in modern browsers — however, inline SVG attributes bypass the theme cascade in some Safari versions. Use the CSS property form: `style={{ fontFamily: 'var(--font-display)' }}` for reliable theme inheritance. Same fix for the glyph at 252-253.

### S7. Board test harness buttons use `onClick` without keyboard affordance validation and have no `role="radiogroup"` / `role="radio"` despite being radio-semantic controls

`BoardTestPage.tsx:93-111` — The `<nav>` contains three mutually-exclusive buttons behaving as radios (only one has `data-state="active"` at a time). Screen readers announce "button, button, button" with no grouping. Either wrap in `<div role="radiogroup" aria-label="Board state">` and give each `role="radio" aria-checked={which === k}`, or convert to actual `<input type="radio">` + `<label>` pairs. Currently also missing `aria-pressed` as a minimum.

### S8. Board test harness buttons lack visible focus ring

`BoardTestPage.tsx:100-106` — `className` list has no `focus-visible:ring-*` or equivalent. Vercel rule: "Interactive elements need visible focus." The active-state `bg-paper text-ink shadow-paper` only applies on the selected button, not the focused one.

### S9. `<nav>` is the wrong landmark for the state picker

`BoardTestPage.tsx:93` — `<nav>` is for site/section *navigation*. A state-switcher for a single page component should be a `<div role="radiogroup">` (see S7) or an unstyled `<fieldset>` with a `<legend>`. Fixing S7 subsumes this.

### S10. Announcer wipes on re-mount without replaying — deltas during route change are lost

`CribbageBoard.tsx:54-55` — `prevScoresRef` and `announcement` reset to `{}` / `''` on every mount. If the component unmounts (e.g. tab switch) and remounts, the first subsequent score update is silently suppressed because `prev === undefined`. Seed `prevScoresRef.current` from initial `pegs` on first render *and* emit an announcement when a peg arrives at a new position post-mount. Low-stakes but a screen-reader-only regression.

### S11. `accessibleName` prop template strings are hardcoded English

`CribbageBoard.tsx:344, 352` — `"${name} trailing peg, hole ${pegSet.backPeg} of 121."` is a hardcoded English literal (Absolute Rule 10). Move to `en.json` as e.g. `table.pegAccessibleName` / `table.trailingPegAccessibleName` with `{name}`/`{position}` placeholders.

### S12. Goal hole 121 is not data-flagged as the win condition for screen readers — no text equivalent

`CribbageBoard.tsx:264-273` — The finish hole has `data-goal-hole="true"` for tests but no `<title>` or visual-text label, and no announcement when a peg reaches 121. SR users never learn a player has won. The live-region should announce "`{name} reached 121 — game over.`" when `frontPeg === 121`.

### S13. Peg `position` prop isn't clamped before being used to drive `useEffect` dependency — a transient invalid value (< 0 or > 121) would trigger a bogus sound + halo

`CribbagePeg.tsx:59-60, 111-114` — The effect gates on `position === prev` then plays sound and starts RAF unconditionally; the clamp at line 111 only protects rendering, not the side effects. If the server ever sends `frontPeg: -1` as a reset sentinel, peg audio fires. Clamp `position` at the top of the effect.

### S14. `lanesView` memo keys off `pegs` identity — will not recompute if `pegs` is mutated in place

`CribbageBoard.tsx:87-93` — `useMemo(() => ..., [pegs])` assumes `pegs` is a new array on each store update. The Zustand store generally returns new references, but if any path mutates the array (e.g. Immer draft leaks), the memo will cache stale lane geometry. Cheap to compute anyway — consider dropping the memo, or depend on `pegs.map(p => p.color + p.playerId).join(',')` to key on identity.

### S15. `--board-*` token consumption is correct *almost* everywhere, but there are two places using raw `var()` without `rgb()` wrapping — invalid SVG colour

`CribbagePeg.tsx:153` — `stroke: 'rgb(var(--ink) / 0.5)'` is correct. However `CribbageBoard.tsx:211` — `'rgb(var(--board-substrate-deep) / 0.6)'` is correct; `CribbageBoard.tsx:165` — `'rgb(var(--board-bezel) / 0.55)'` is correct. Re-checked: no raw-`var()` bugs in the current code. **This one is a pass** — documented here because the brief flagged it as a risk area. Leaving for reviewers as verified.

### S16. `fill="rgb(var(--whisper))"` glyph at the start cluster is the only theme-token ref that isn't prefixed with a `--board-*` token

`CribbageBoard.tsx:254` — The suit glyph colour pulls from `--whisper` directly, bypassing the board token namespace defined explicitly for theme-neutral material language (comment in `tokens.css:61-64`). In Obsidian this renders near the `--whisper` dim grey against a dark substrate and the glyph disappears. Add `--board-glyph` to each theme block or reuse `--board-hole-rim`.

### S17. `<svg>` has no `width`/`height` attributes — CLS risk if parent lacks intrinsic sizing

`CribbageBoard.tsx:102-109` — The SVG uses `className="w-full h-auto block"` which is fine when Tailwind CSS is loaded, but during hydration or CSS-disabled flash the browser falls back to `300×150` (SVG default) and the layout jumps. Per Vercel guideline: "`<img>` needs explicit `width` and `height` (prevents CLS)" — the same applies to SVGs used as images. Add `width={VIEWBOX}` and `height={VIEWBOX}` as attributes; `w-full h-auto` CSS will still scale them.

### S18. RAF loop uses React `setState` per frame — re-renders the entire `CribbagePeg` subtree 60 times/sec

`CribbagePeg.tsx:88, 102` — `setRenderedIdx(cur)` triggers a full React render per RAF frame. For the landing-halo circle, that's fine; for the core peg it would be cheaper to imperatively mutate the `<circle>`'s `cx`/`cy` via a ref. This also compounds S4 (drop-shadow recomputed per render). Not a visible perf bug today at 2–3 pegs, but scales badly if the board ever supports 4 players.

### S19. No `transform-box: fill-box; transform-origin: center` on the halo `<circle>`

`CribbagePeg.tsx:136-142` — The `cribbage-halo` keyframes use `transform: scale(...)`. On SVG elements, the default `transform-origin` is the SVG root `(0,0)`, not the circle centre, so the scale animates *from the corner of the SVG*. Inline `transformOrigin: 'center'` is set but without `transformBox: 'fill-box'` it resolves against the element's *reference box*, which in SVG is the SVG's own coordinate system — still not the circle centre. Add `transformBox: 'fill-box'` (Vercel explicit SVG rule).

### S20. `onClick` + `type="button"` are present on the harness buttons but no `touch-action: manipulation`

`BoardTestPage.tsx:96-106` — Vercel rule: "`touch-action: manipulation` (prevents double-tap zoom delay)". Add to the button class list (Tailwind: `touch-manipulation`).

### S21. Test file does not cover reduced-motion path

`CribbageBoard.test.tsx` — 11 tests cover structure; none mock `matchMedia` to verify the reduced-motion branch snaps rather than animates. Given B2 exists, the missing test is why it wasn't caught. Add a test that stubs `window.matchMedia('(prefers-reduced-motion: reduce)').matches = true` and asserts `renderedIdx` matches `position` on first frame (no interpolation).

---

## NICE-TO-HAVE

### N1. `skunkAngle` / `doubleSkunkAngle` recomputed on every render

`CribbageBoard.tsx:75-82` — Pure geometry that never changes. Lift to module scope alongside `BOARD` (or memoise with empty deps).

### N2. `LANE_ORDER.map(...)` pre-renders three lane groups even for 2-player games, with `data-lane-empty="true"` but a fully drawn groove + 121 holes

`CribbageBoard.tsx:170-276` — DOM weight for 2-player games is the same as 3-player (363 circles). This is the stated intent (layout stability — see test at line 123), but the empty lane's holes still pass the `[data-hole]` selector. If the visual opacity tween for empty lanes (0.2 vs 0.55) isn't enough, consider `aria-hidden` on empty lane groups.

### N3. Inline arrow function `(() => { ... })()` for start cluster

`CribbageBoard.tsx:220-237, 240-260` — IIFE inside JSX for the start-cluster dots and glyph is hard to read. Extract to a small `StartCluster` component taking `{ h, h1, glyph, isEmpty }`. Does not affect tests or behaviour.

### N4. `SKUNK_HOLE` / `DOUBLE_SKUNK_HOLE` constants duplicate `boardState.skunkLine` / `boardState.doubleskunkLine`

`CribbageBoard.tsx:36-37` — The state object already carries these. Using the props preserves the single source of truth (and would let a different rule-variant override them via the shared type).

### N5. Score readout `<ul>` dots are pure decoration but colour-only differentiator

`CribbageBoard.tsx:369-372` — `laneDotColor` is a coloured dot with `aria-hidden`. The spec direction required colour + glyph as redundant differentiators on the *board* — extend that policy to the readout: put the suit glyph (`♠ ♥ ♦`) into the readout too so a monochrome print-out still identifies lanes.

### N6. `en.table.scorePoints.replace('{name}', name).replace('{score}', ...)` — fragile format-string pattern

`CribbageBoard.tsx:374-376` — Works, but misses plural forms ("1 point" vs "2 points"). Adopt `Intl.PluralRules` or a tiny i18n helper. Low priority — only English so far.

### N7. Board harness lacks `<h1>` → `<h2>` / skip-link hierarchy

`BoardTestPage.tsx:89-119` — `<h1>` is fine; there's no `<main>` skip link because the page is dev-only. Non-blocking.

### N8. Board harness landing-state setTimeout cancels correctly but doesn't reset `prevScoresRef` inside the board when `which` flips between states

`BoardTestPage.tsx:79-87` — Rapidly toggling `start → mid → start` may cause a spurious announcement for "Alice adjusted to 0." Not user-facing (dev harness only). Skippable.

### N9. `viewBox={0 0 ${VIEWBOX} ${VIEWBOX}}` uses template literal with numbers

`CribbageBoard.tsx:105` — Fine. Could be `viewBox="0 0 400 400"` literal since `VIEWBOX` never changes, saving a template evaluation.

### N10. Peg colour mapping has a redundant ternary

`CribbagePeg.tsx:125` — `color === 'blue' ? 'blue' : color === 'green' ? 'green' : 'red'` is functionally `` `--color-card-${color}` ``. Simplify.

### N11. No storybook / isolated preview beyond the dev page

`BoardTestPage.tsx` — `/_board-test` route is fine but undocumented. Add a note in `CLAUDE.md` or a README under `design/` so designers can find it.

### N12. Playwright screenshots for the three harness states aren't referenced from this code path

SPEC.md §26 mandates screenshots at checkpoints. The harness exists but there's no accompanying Playwright spec. Acceptable if one is planned in the same PR — otherwise flag.

---

## Token consumption spot-check (verification)

Tokens are stored as RGB triplets (e.g. `--board-substrate: 226 212 184`). Correct usage is `rgb(var(--board-substrate))` or `rgb(var(--board-substrate) / 0.6)`. Grep across the board files:

| Site | Call form | Verdict |
|---|---|---|
| `CribbageBoard.tsx:153` | `"rgb(var(--board-substrate))"` | pass |
| `CribbageBoard.tsx:164` | `"rgb(var(--board-substrate))"` | pass |
| `CribbageBoard.tsx:165` | `"rgb(var(--board-bezel) / 0.55)"` | pass |
| `CribbageBoard.tsx:184` | `"rgb(var(--board-substrate-deep))"` | pass |
| `CribbageBoard.tsx:193` | `"rgb(var(--board-bezel))"` | pass |
| `CribbageBoard.tsx:210-212` | `rgb(var(--board-hole))` / `rgb(var(--board-hole-rim))` / `rgb(var(--board-substrate-deep) / 0.6)` | pass |
| `CribbageBoard.tsx:232-234` | `"rgb(var(--board-start))"` | pass |
| `CribbageBoard.tsx:254` | `"rgb(var(--whisper))"` | **see S16** (not a `--board-*` token) |
| `CribbageBoard.tsx:270-271` | `rgb(var(--board-finish))` / `rgb(var(--board-bezel))` | pass |
| `CribbageBoard.tsx:289, 301, 313, 325` | `rgb(var(--board-milestone))` | pass |
| `CribbagePeg.tsx:125` | `rgb(var(--color-card-${color}))` | pass |
| `CribbagePeg.tsx:153, 156` | `rgb(var(--ink) / 0.5)` / `rgb(var(--ink) / 0.55)` | pass |
| Tailwind arbitrary `bg-[rgb(var(--color-card-red))]` at `CribbageBoard.tsx:42-45` | pass |

No raw `var(--x)` on an SVG colour attribute found. The brief's stated risk is not present.

---

## Summary table

| Count | Category |
|---|---|
| **3** | BLOCKER |
| **21** | SHOULD-FIX |
| **12** | NICE-TO-HAVE |
| **36** | Total findings |

| ID | Area | Severity | File |
|---|---|---|---|
| B1 | a11y / live region | BLOCKER | `CribbageBoard.tsx:56-70, 98-100` |
| B2 | reduced motion | BLOCKER | `CribbagePeg.tsx:66-72, 130-145` |
| B3 | CSS scope | BLOCKER | `CribbageBoard.tsx:137-142` |
| S1 | reduced motion reactivity | SHOULD-FIX | `CribbagePeg.tsx:34-37` |
| S2 | SVG a11y tree | SHOULD-FIX | `CribbageBoard.tsx:102`, `CribbagePeg.tsx:160` |
| S3 | i18n | SHOULD-FIX | `CribbageBoard.tsx:364` |
| S4 | perf — filter on RAF | SHOULD-FIX | `CribbagePeg.tsx:155-157` |
| S5 | perf — feTurbulence | SHOULD-FIX | `CribbageBoard.tsx:113-132, 154` |
| S6 | SVG attrs vs CSS | SHOULD-FIX | `CribbageBoard.tsx:252-253, 298-300, 321-324` |
| S7 | a11y / radio semantics | SHOULD-FIX | `BoardTestPage.tsx:93-111` |
| S8 | focus ring | SHOULD-FIX | `BoardTestPage.tsx:100-106` |
| S9 | landmark | SHOULD-FIX | `BoardTestPage.tsx:93` |
| S10 | announcer re-mount | SHOULD-FIX | `CribbageBoard.tsx:54-55` |
| S11 | i18n | SHOULD-FIX | `CribbageBoard.tsx:344, 352` |
| S12 | win announcement | SHOULD-FIX | `CribbageBoard.tsx:264-273` |
| S13 | clamp side-effects | SHOULD-FIX | `CribbagePeg.tsx:59-60, 111-114` |
| S14 | memo key | SHOULD-FIX | `CribbageBoard.tsx:87-93` |
| S15 | token audit (pass) | VERIFIED | n/a |
| S16 | `--whisper` outside board ns | SHOULD-FIX | `CribbageBoard.tsx:254` |
| S17 | CLS — SVG sizing | SHOULD-FIX | `CribbageBoard.tsx:102-109` |
| S18 | perf — React renders per RAF | SHOULD-FIX | `CribbagePeg.tsx:88, 102` |
| S19 | `transform-box: fill-box` | SHOULD-FIX | `CribbagePeg.tsx:136-142` |
| S20 | `touch-action` | SHOULD-FIX | `BoardTestPage.tsx:96-106` |
| S21 | reduced-motion test | SHOULD-FIX | `CribbageBoard.test.tsx` |
| N1 | recompute ticks | NICE-TO-HAVE | `CribbageBoard.tsx:75-82` |
| N2 | DOM weight | NICE-TO-HAVE | `CribbageBoard.tsx:170-276` |
| N3 | readability | NICE-TO-HAVE | `CribbageBoard.tsx:220-260` |
| N4 | duplicated const | NICE-TO-HAVE | `CribbageBoard.tsx:36-37` |
| N5 | readout glyph | NICE-TO-HAVE | `CribbageBoard.tsx:369-372` |
| N6 | plural forms | NICE-TO-HAVE | `CribbageBoard.tsx:374-376` |
| N7 | heading hierarchy | NICE-TO-HAVE | `BoardTestPage.tsx` |
| N8 | harness state bounce | NICE-TO-HAVE | `BoardTestPage.tsx:79-87` |
| N9 | literal viewBox | NICE-TO-HAVE | `CribbageBoard.tsx:105` |
| N10 | redundant ternary | NICE-TO-HAVE | `CribbagePeg.tsx:125` |
| N11 | docs | NICE-TO-HAVE | `BoardTestPage.tsx` |
| N12 | screenshots | NICE-TO-HAVE | n/a |

---

**Top three to fix first:** B2 (reduced-motion halo plays anyway), B3 (keyframes leak), B1 (bot score announcer spam). Those three close the accessibility and motion contract the brief committed to. The `--board-*` token audit came up clean (S15 verification); the substantive work is in the animator (S1, S4, S18, S19) and the SVG accessibility tree (S2, S12).
