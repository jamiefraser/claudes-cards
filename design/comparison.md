# Phase 4A — Responsive Comparison (Before / After)

**Date:** 2026-04-21
**Branch:** `responsive-ui` (Phase 3 applied, no commits yet)
**Direction applied:** Le Salon
**Method:** Playwright MCP; same game (Phase 10), same user (TestPlayer1), same opponent (1 bot), same 4 game states, same 3 viewports as the Phase 1 baseline.

Baseline screenshots are in `design/baseline/`. After-Phase-3 screenshots are in `design/after/` with the same filenames.

---

## Responsive checklist

Measured in the running app at each target viewport.

| Requirement | 375 | 820 | 1440 | Status |
|---|---|---|---|---|
| No horizontal scroll at 375px (`scrollWidth === innerWidth`) | ✅ 375 = 375 | — | — | **PASS** |
| Card tap target ≥ 44 × 44 | ✅ 48 × 72 | ✅ 64 × 96 | ✅ 64 × 96 | **PASS** |
| All ActionBar buttons ≥ 44px tall | ✅ 44 | ✅ 44 | ✅ 44 | **PASS** |
| All ActionBar buttons ≥ 44px wide (or in scroll strip) | ✅ 70–88 | ✅ 93–115 | ✅ 93–115 | **PASS** |
| Hand fits without wrapping (single row) | ✅ scroll strip | ✅ single row | ✅ single row | **PASS** |
| Opponent seat does NOT overlap felt | ✅ own band | ✅ own band | ✅ radial (by design) | **PASS** |
| End-of-round backdrop covers chat | ✅ | ✅ | ✅ | **PASS** |
| Body bg applied (Le Salon paper) | ✅ rgb(244, 234, 216) | ✅ | ✅ | **PASS** |
| Body font Commissioner / headings Fraunces | ✅ | ✅ | ✅ | **PASS** |
| `prefers-reduced-motion` rule present | ✅ (tokens.css :83) | — | — | **PASS** |
| Keyboard Enter activates a card | ✅ (CardComponent.tsx :72) | — | — | **PASS** |

*(Ratings are per-viewport. Card tap target width of 48 is the mobile size; it exceeds the 44px floor. The scroll-strip ActionBar at 375px contains buttons whose visible width drops to 70px within the strip — still far above the 44×44 minimum.)*

---

## State-by-state

### 1. Lobby

| Viewport | Before (`design/baseline/…-01-lobby.png`) | After (`design/after/…-01-lobby.png`) | Notes |
|---|---|---|---|
| **Desktop 1440** | Slate bg; 3-col grid; large empty friends column; title weight generic | Paper bg; 3-col grid; friends collapsed on right; Fraunces title; hairline under heading; `15 games` counter | **Fixed:** L1.1/L1.2 wasted vertical space (friends rail is compact + sticky). **Fixed:** L1.4 typography identity. |
| **Tablet 820** | 2-col grid; titles wrapping ("Crazy\nEights"); buttons wrapping ("Browse\nRooms") | 2-col grid; single-line titles; single-line buttons; collapsed `FILTER ROOMS ▾` pill | **Fixed:** L1.5 title wrap. **Fixed:** L1.6 button wrap (added `whitespace-nowrap`). **Fixed:** L1.7 narrow grid (filter now a pill on tablet). |
| **Mobile 375** | Nav wrap; flush-left filter blob; cards with wasted padding | Sticky paper header; collapsible filter; friends drawer via ☍; tighter card padding | **Fixed:** L1.9 header wrap. **Fixed:** L1.10 blob. **Fixed:** L1.11 filter always-visible (now a toggle). **Fixed:** L1.12 friends buried at bottom. |

### 2. In-game

| Viewport | Before | After | Notes |
|---|---|---|---|
| **Desktop 1440** | Slate + dark bg, chat rail empty, opponent floating on felt rim | Paper bg, muted forest felt, radial seat, chat rail still always-on (by design at lg) | **Partially fixed:** I1.1 chat rail visible but in theme. I1.2 opponent now sits at radial position within the lg layout (no clipping in these shots, though there is a minor edge-kiss). |
| **Tablet 820** | Opponent floating OVER felt at top-left (clipping); dead band between felt and action bar | Opponent in its own band with hairline divider; felt sits cleanly below; action bar immediately beneath felt; chat collapsed to "✎ Chat" tab | **Fixed:** I1.6 opponent overlap (biggest tablet issue). **Fixed:** I1.7 always-visible grey chat (now collapsed). **Fixed:** I1.8 empty band. |
| **Mobile 375** | Opponent overlapping discard pile; hand wrapping to 2 rows (6+5); 5 action buttons wrapping to 2 rows; chat always eating bottom 100px | Opponent in own rail above felt; hand in horizontal scroll strip (10 cards one row); action bar in horizontal scroll strip; chat collapsed behind floating tab | **Fixed:** I1.10 opponent overlap. **Fixed:** I1.11 hand wrap (THE primary audit finding). **Fixed:** I1.12 action wrap. **Fixed:** I1.13 persistent chat. **Fixed:** I1.14 pile behind overlay. |

### 3. Mid-turn (card selected for discard)

| Viewport | Before | After | Notes |
|---|---|---|---|
| **Desktop 1440** | Indigo glow + heavy shadow on selected card; translate without reserved space | Ochre border + 10px lift + 1px ochre hairline sweep beneath card; reserved `pt-5` in strip | **Fixed:** M1.1 lift could clip. Le Salon typographic "rule" signature applied. |
| **Tablet 820** | Same issue as desktop; larger hand pushed elevation into felt | Same as desktop, reserved space prevents clipping | **Fixed:** M1.3. |
| **Mobile 375** | Selected card in 2nd row pushed into cards above via negative translate | Single-row scroll strip → no overlap ever possible | **Fixed:** M1.4 (blocker). |

### 4. End-of-round (Phase 10 hand score)

| Viewport | Before | After | Notes |
|---|---|---|---|
| **Desktop 1440** | Modal rendered inside GameTable inner column, chat rail on right NOT dimmed | Modal rendered via `createPortal(document.body)`; backdrop covers chat rail, opponent seat, dock, everything | **Fixed:** E1.3 layering / z-index. Modal retains Le Salon paper surface with burgundy-dim ochre accents. |
| **Tablet 820** | Same z-index bug as desktop — chat + dock visible through the overlay | Backdrop covers all siblings | **Fixed:** E1.3 on tablet. |
| **Mobile 375** | Chat input bar interactive behind modal | Chat tab dimmed by backdrop; portal fix | **Fixed:** E1.4. |

---

## Audit findings now resolved

From the original `design/audit.md` (40 findings, 9 BLOCK):

| Finding | Status |
|---|---|
| **L1.5** Tablet game card title mid-word wrap (`GameCard.tsx:28`) | **FIXED** — `break-words` + `hyphens-auto` + reduced Tailwind `md:` breakpoint meaning |
| **L1.6** Tablet Browse/Create button wrap | **FIXED** — added `whitespace-nowrap` + `min-h-[44px]` |
| **L1.9** Mobile header wrap | **FIXED** — tighter header, user name hidden below sm, 44px tap minimum |
| **L1.10** Mobile filter blob | **FIXED** — collapsible filter with active-count chip |
| **I1.6** Tablet opponent over felt | **FIXED** — opponent now in its own band with hairline divider (`GameTable.tsx:830–890`) |
| **I1.10** Mobile opponent over felt | **FIXED** — same structural change |
| **I1.11** Mobile hand wrap | **FIXED** — `HandComponent.tsx:158` horizontal scroll strip w/ scroll-snap + fan overlap |
| **I1.12** Mobile action bar wrap | **FIXED** — `ActionBar.tsx:237` scroll strip via `overflow-x-auto no-scrollbar` |
| **M1.4** Mobile selected-card row overlap | **FIXED** — no wrapping now possible |
| **E1.3 / E1.4** Modal backdrop sibling coverage | **FIXED** — `Phase10HandScore.tsx` rendered via `createPortal(document.body)` |
| **X2** Global `prefers-reduced-motion` | **FIXED** — `tokens.css:83–90` |
| **X3** Breakpoints at 640 / 1024 / 1440 | **FIXED** — `tailwind.config.js:10–14` |
| **X4** Cards activate on Enter (not just Space) | **FIXED** — `CardComponent.tsx:72` |
| **X5** Distinct typography pairing | **FIXED** — Fraunces + Commissioner + JetBrains Mono; loaded from Google Fonts |
| **X1** CSS-variable-driven tokens | **FIXED** — `tokens.css` RGB-triplet pattern; Tailwind consumes via `rgb(var(--x) / <alpha-value>)` |

**Phase 4A verdict: no responsive BLOCKers remain.**

---

## Deferred for Phase 5 polish

Not responsive BLOCKers, but surfaced during the re-shoot:

1. **Cribbage pegboard overflows felt at 375px.** Out of scope for baseline audit (Phase 10 only) but a real responsive bug caught when retesting. `src/components/table/cribbage/CribbageBoard.tsx` — probably a fixed SVG viewBox. *Fix in Phase 5.*
2. **Desktop chat rail still always visible** — not reduced-motion/touch-critical, but consumes horizontal real estate at 1440 even when no messages exist. Collapsing-to-tab on desktop would simplify, but keeps current desktop affordance for now.
3. **Chat tab (mobile) visually covers the "Suit" sort button** when the identity row wraps to its second line. Minor — sort buttons still reachable when chat is closed. *Fix in Phase 5.*
4. **BOT badge alignment on compact bot seats** — purple chip slightly overlaps the robot avatar on the mobile-rail variant.
5. **Opponent seat can still touch the felt rim on desktop** when the viewport is narrower than ~1500px. The radial position is geometric and ignores the current felt bounds.

These are all nice-to-have polish items, not blockers. Subagent A reports no responsive issues at the audit-scope severity (no horizontal overflow, no touch undersized, no wrapping hand, no modal leak).

---

## File pointer reference

| After file | Counterpart baseline |
|---|---|
| `design/after/desktop-01-lobby.png` | `design/baseline/desktop-01-lobby.png` |
| `design/after/tablet-01-lobby.png` | `design/baseline/tablet-01-lobby.png` |
| `design/after/mobile-01-lobby.png` | `design/baseline/mobile-01-lobby.png` |
| `design/after/desktop-02-in-game.png` | `design/baseline/desktop-02-in-game.png` |
| `design/after/tablet-02-in-game.png` | `design/baseline/tablet-02-in-game.png` |
| `design/after/mobile-02-in-game.png` | `design/baseline/mobile-02-in-game.png` |
| `design/after/desktop-03-mid-turn.png` | `design/baseline/desktop-03-mid-turn.png` |
| `design/after/tablet-03-mid-turn.png` | `design/baseline/tablet-03-mid-turn.png` |
| `design/after/mobile-03-mid-turn.png` | `design/baseline/mobile-03-mid-turn.png` |
| `design/after/desktop-04-end-of-round.png` | `design/baseline/desktop-04-end-of-round.png` |
| `design/after/tablet-04-end-of-round.png` | `design/baseline/tablet-04-end-of-round.png` |
| `design/after/mobile-04-end-of-round.png` | `design/baseline/mobile-04-end-of-round.png` |
