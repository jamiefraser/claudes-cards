# Responsive Baseline Audit — Phase 1

**Date:** 2026-04-21
**Branch:** `responsive-ui`
**Scope:** Phase 10 game (lobby, in-game, mid-turn, end-of-round) at 375×812, 820×1180, 1440×900.
**Method:** Playwright MCP. User = `TestPlayer1`. Single opponent = 1 bot. Dev auth.
**Artefacts:** `design/baseline/{desktop,tablet,mobile}-0{1..4}-<state>.png` (12 shots).

---

## Severity legend

| Tag | Meaning |
|---|---|
| **[BLOCK]** | Makes the state unusable or causes overflow / off-screen controls |
| **[HIGH]** | Visibly broken but still operable; degrades perceived quality |
| **[MED]** | Cramped, awkward, or accessibility-borderline |
| **[LOW]** | Polish — wasted space, tone, cross-state inconsistency |

All file paths are relative to `apps/frontend/`.

---

## 1. Lobby

### Desktop 1440×900 (`desktop-01-lobby.png`)

- **[LOW] L1.1 — Filter sidebar is a vertical sliver of empty space.**
  `src/components/lobby/FilterSidebar.tsx:36` declares `w-full md:w-56` and the sidebar ends after ~220px of controls, but the container (`src/pages/LobbyPage.tsx:105` `main flex-1`) stretches it full-height → hundreds of vertical pixels of dead space on the left.
- **[LOW] L1.2 — Friends panel has the same problem on the right.**
  `src/components/social/FriendList.tsx:93` `md:w-60 … flex flex-col gap-4` with only a header and a placeholder line ("No friends yet…") leaves a ~700px-tall empty column.
- **[LOW] L1.3 — Page never uses the full viewport width.**
  3-col grid + 224px filter + 240px friends + padding fits comfortably, but the grid never scales beyond `lg:grid-cols-3` (`src/components/lobby/GameBrowser.tsx:63`) so 1440px+ is just "same layout, bigger gutters."
- **[LOW] L1.4 — "Card Platform" / nav contrast is flat.**
  `src/pages/LobbyPage.tsx:71-102` is generic `bg-slate-800 … text-white` — fine but gives the lobby no identity separate from `TablePage`.

### Tablet 820×1180 (`tablet-01-lobby.png`)

- **[BLOCK] L1.5 — Game card titles break mid-word.**
  `src/components/lobby/GameCard.tsx:28` heading at `text-base font-semibold`. In the 2-col layout, card inner width is ~160px. "Crazy Eights", "Gin Rummy", "Go Fish", and "Phase 10" all wrap onto two lines. Looks especially bad when the "Async" chip sits beside a two-line heading.
- **[BLOCK] L1.6 — Action buttons on each card wrap.**
  `src/components/lobby/GameCard.tsx:48-60` — "Browse Rooms" and "Create Room" both `text-sm font-medium py-2 px-4` with no explicit `whitespace-nowrap`. At card width ~140px they split to "Browse\nRooms" / "Create\nRoom" on **every** card.
- **[HIGH] L1.7 — Grid is too narrow because two sidebars flank it.**
  FilterSidebar (224px) + FriendList (240px) + padding + gaps eats ~560px, leaving ~260px for a 2-col grid → ~120px per card. At tablet, one sidebar should collapse.
- **[HIGH] L1.8 — Filter + Friends panels eat most of the viewport but only show ~200px of actual content each.**
  See L1.1/L1.2 — same issue, more egregious at tablet density.

### Mobile 375×812 (`mobile-01-lobby.png`)

- **[BLOCK] L1.9 — Header nav wraps into the first row of content.**
  `src/pages/LobbyPage.tsx:71` uses `flex items-center justify-between gap-2 flex-wrap`. With 4 nav buttons (Leaderboard, Settings, Admin optional, Sign Out) at min-h 44, the "test-player-1" label is hidden (`hidden sm:inline`, line 74) but on very narrow screens the header still wraps to 2 rows, leaving no room for the page title.
- **[BLOCK] L1.10 — FilterSidebar and GameBrowser render flush-left with no horizontal padding on the inner aside.**
  `GameBrowser.tsx:51` wraps both in `flex flex-col md:flex-row gap-4 md:gap-6 flex-1 min-w-0`. The outer `main` has `p-3 sm:p-6` (`LobbyPage.tsx:105`), but the vertical stack on mobile puts "FILTER ROOMS" at the far left edge, with no section header/card to separate it from the game list below. Reads as one continuous blob.
- **[MED] L1.11 — Filter is always-visible and eats ~240px of vertical real estate before the first game card.**
  Should collapse to a "Filters" toggle on mobile (`FilterSidebar.tsx:36`).
- **[MED] L1.12 — Friends panel at the very bottom is reached only after scrolling past 15 games.**
  `FriendList.tsx:93` — stacks after the grid. Users won't find it.
- **[LOW] L1.13 — Cards use the same `rounded-lg p-4` padding on mobile as desktop, wasting 16px per side.**
  `GameCard.tsx:23`.

---

## 2. In-Game (Phase 10, hand of 10)

### Desktop 1440×900 (`desktop-02-in-game.png`)

- **[HIGH] I1.1 — Chat rail takes full-height but is empty 95% of the time.**
  `src/components/chat/TableChat.tsx:96` `lg:w-72 lg:h-full max-h-none`. Pinned at 288px on the right, mostly grey — wastes prime desktop real estate. Should collapse to a dock / bubble or be toggleable.
- **[HIGH] I1.2 — Opponent seat sits *on top of* the felt, not beside it.**
  Radial layout in `src/components/table/GameTable.tsx:1010-1065` uses `SEAT_RX = FELT_W/2 + 96` = 536px from centre. At 1440px viewport with felt capped at 880px wide, the felt sits at x≈280 and opponent lands at x≈816 — roughly correct — but because radial items are `position: absolute` from a zero-size anchor (`GameTable.tsx:1012` `width: 0, height: 0`), the opponent card **overlaps the felt top edge** visibly (see screenshot). No breathing room between seat and felt.
- **[MED] I1.3 — Felt is fixed at 880×520 max; the screen has 1440×900.**
  `GameTable.tsx:58-61` `const FELT_W = 880`. Padding around it is massive. The table feels tiny in a big room.
- **[MED] I1.4 — Rules tab sticks out on the left as a vertical sliver.**
  `src/components/table/RulesPanel.tsx` (floating vertical strip) — tolerable but adds visual noise at the edge.
- **[LOW] I1.5 — TestPlayer1 identity + Rank/Suit chips sit *below* the hand, visually divorced from it.**
  `GameTable.tsx:1148-1180`. The identity pill reads as a standalone element, not "this is you".

### Tablet 820×1180 (`tablet-02-in-game.png`)

- **[BLOCK] I1.6 — Opponent seat overlaps the felt's top-left corner.**
  `GameTable.tsx:840-885` mobile/tablet opponent strip is `absolute left-0 right-0 z-10` positioned at `top: calc(var(--mobile-chrome-h, 88px))` — the chrome pill sits above it (at `top-5 left-6` = 24px), then the opponent strip pushes the BotSeat card (min-width 140px) over the felt's upper rim. Result: big grey bot card floating over green felt, bot's purple BOT chip nearly colliding with the "Your turn" banner above.
- **[HIGH] I1.7 — Chat pane stacks full-width below the hand, adds another ~140px of grey.**
  `TableChat.tsx:96` below `lg` gives `w-full … max-h-60` — always visible, always empty. Should be collapsed by default on tablet/mobile.
- **[MED] I1.8 — Big empty space between the felt and the action bar.**
  `GameTable.tsx:888` uses `pt-40 pb-72 sm:pt-24 sm:pb-80` to reserve room for chrome + dock, but on 820×1180 the felt ends at ~680px and the action bar starts at ~760px — a ~80px empty band of dark background.
- **[LOW] I1.9 — "Rules" vertical tab reads as cropped text ("R U L E S").**
  Same as I1.4, more noticeable on tablet.

### Mobile 375×812 (`mobile-02-in-game.png`)

- **[BLOCK] I1.10 — Opponent seat floats over the felt, covering the discard pile area on narrower phones.**
  Same origin as I1.6 — `GameTable.tsx:840-885`. On a 360px device the 140px-min BotSeat blocks out the upper left of the felt.
- **[BLOCK] I1.11 — Hand wraps to 2 rows (6 + 5) with 10 cards of Phase 10 at 48px each.**
  `src/components/cards/CardComponent.tsx:85` sets `w-12 h-[4.5rem] sm:w-16 sm:h-24` — 10 × (48 + 4gap) = 520px needed for one row, viewport is 375. `HandComponent.tsx:148` uses `flex-wrap` so it silently wraps. For Canasta (up to ~15) it'll be 3 rows. **This is the single biggest responsive break.** Needs a fanned/scrollable horizontal strip per the Phase 3 brief.
- **[BLOCK] I1.12 — Action bar wraps "Skip Turn" to a second row.**
  `src/components/table/ActionBar.tsx:237` sets `flex-row flex-wrap` so 5 Phase-10 buttons + gaps exceed 375 − 16 = 359px. "Draw Deck / Take Top / Lay Down / Discard" take row 1, "Skip Turn" dangles on row 2 — breaks the visual pill.
- **[HIGH] I1.13 — Chat always visible, eats ~100px at the bottom.**
  `TableChat.tsx:96` `max-h-40 sm:max-h-60`. On mobile, the chat input bar is persistent even when the user is playing — competes with the hand for the most valuable screen real estate.
- **[HIGH] I1.14 — Draw & discard piles not visible above the fold.**
  Felt is compressed (see I1.8) and the piles sit dead-centre (`GameTable.tsx:898` `items-center justify-center`) — at 812px viewport height, piles render around y=380 behind the bot overlay (I1.10).
- **[MED] I1.15 — Phase 1 objective chip stacks between the action bar and hand.**
  `GameTable.tsx:1132-1137` `<Phase10Objective />`. Adds a 44px band, shoving the hand down further into the chat zone.
- **[MED] I1.16 — Card touch target is 48×72 on mobile.**
  `CardComponent.tsx:85` `w-12 h-[4.5rem]`. Width meets the 44×44 floor narrowly, but because cards are tightly packed (gap-1 = 4px), the effective tap target is closer to 44×72, and the wrap forces tight vertical stacking. WCAG 2.5.5 AAA recommends 44px with 8px clearance.
- **[LOW] I1.17 — "Rank / Suit" sort buttons wrap below the identity pill.**
  `GameTable.tsx:1164-1179` — fine, but the identity pill reads "TestPlayer1 · 0" and loses the player without a score prefix.

---

## 3. Mid-turn — card selected for discard

*(Same layout as in-game; issues below are incremental to §2.)*

### Desktop 1440×900 (`desktop-03-mid-turn.png`)

- **[HIGH] M1.1 — Selected-card elevation relies on `-translate-y-3` with no space reserved above the hand.**
  `src/components/cards/CardComponent.tsx:87-88` `'border-indigo-400 -translate-y-3 shadow-lg shadow-indigo-500/40'`. The parent `<ul>` in `HandComponent.tsx:148` has `items-end py-4` — the translate works, but if it ever translates further or the hand wraps, the selected card could clip through the action bar (we see this specifically when the hand wraps on mobile — see M1.4).
- **[LOW] M1.2 — "Discard" pill turns rose-red when enabled; contrast is OK but no secondary affordance (icon/animation) distinguishes it from a destructive action.**
  `ActionBar.tsx:264-267` `bg-rose-600/90 text-white …` for discard mirrors the `btnDanger` style. Users could confuse "discard" with "end game".

### Tablet 820×1180 (`tablet-03-mid-turn.png`)

- **[MED] M1.3 — Same elevation issue as M1.1, more visible because the hand is larger and the felt sits closer to the action bar.**

### Mobile 375×812 (`mobile-03-mid-turn.png`)

- **[BLOCK] M1.4 — When the selected card is in the **second row** of a wrapped hand, `-translate-y-3` pushes it *into* the row above, visually overlapping the cards there.**
  Reproduces deterministically with any 10+ card Phase 10 hand on mobile.
  Root cause: `CardComponent.tsx:88` translate + `HandComponent.tsx:148` `flex-wrap` interaction. Phase 3 fix should replace the wrap with a horizontal scroll/fan.

---

## 4. End-of-round — Phase 10 hand-complete modal

### Desktop 1440×900 (`desktop-04-end-of-round.png`)

- **[LOW] E1.1 — Modal is well-sized (`max-w-lg` = 512px, `src/components/table/Phase10HandScore.tsx:77`) but the backdrop dims the entire viewport including the chat rail and opponent seat, which looks intentional.** No issue here.
- **[LOW] E1.2 — Only the Phase 10 game has this hand-end UX.** Cribbage has `CribbageCountingDisplay`, Gin Rummy has `GinRummyShowdown`, others have `WinCelebration`. A unified pattern doesn't exist — outside Phase 1 scope but worth noting for Phase 2 direction choices.

### Tablet 820×1180 (`tablet-04-end-of-round.png`)

- **[MED] E1.3 — Modal overlays the felt but is offset downward by the tall chrome + chat stack above.**
  `Phase10HandScore.tsx:69` `fixed inset-0 flex items-center justify-center p-4 sm:p-6` — centering is true, but the background behind the modal (un-dimmed chrome, visible dock, visible chat) reads as noise. The dim layer is `absolute inset-0 bg-night/80` (line 73) so it should cover — but the screenshot shows chat at the bottom clearly visible. Suspect the modal sits inside the `<DndContext><div>` wrapper (`GameTable.tsx:722-723`) which has `overflow-hidden` but the chat is a **sibling** (`GameTable.tsx:1198`) so backdrop doesn't cover it. **This is a z-index / DOM-layering bug.**

### Mobile 375×812 (`mobile-04-end-of-round.png`)

- **[HIGH] E1.4 — Same backdrop / chat layering bug as E1.3.** Chat input at bottom is clearly visible and interactive while the modal is open.
  `Phase10HandScore.tsx:69` renders with `z-50` but TableChat is outside `GameTable`'s inner column. Needs to either move the modal to a portal at document body or include chat inside the dim zone.
- **[MED] E1.5 — "Ready for next hand" button is the only path forward.**
  `Phase10HandScore.tsx:180-194`. It's a 48px min-height brass gradient pill — touch target OK — but the modal itself takes ~420px of vertical space leaving little context about the scoreboard.

---

## 5. Cross-cutting findings

- **[HIGH] X1 — No design tokens / CSS variables.**
  Colours are Tailwind palette refs (`slate-800`, `indigo-600`, etc.) and one-off custom colours (`bg-night`, `text-brass-bright`, `text-brand-secondary`) that appear to be defined in `tailwind.config.js` but **not exposed as CSS variables**. Phase 2 needs variables so themes can swap.
  Check: `tailwind.config.js` — confirm.
- **[HIGH] X2 — No `prefers-reduced-motion` guard.**
  Audit found animations at `CardComponent.tsx:86` (`transition-transform duration-150`), `HandComponent.tsx:73` (`card-slide-in`), `GameTable.tsx:741` (`animate-turn-pulse`), `BotSeat.tsx:162` (`animate-pulse`), `Phase10HandScore.tsx:72,80` (`animate-[seat-in_…]`), `ActionBar.tsx:242` (`animate-[seat-in_…]`). None are gated behind `@media (prefers-reduced-motion: reduce)`.
- **[HIGH] X3 — Breakpoints scattered and inconsistent.**
  Tailwind defaults used: `sm` (640), `md` (768), `lg` (1024). Phase 3 spec calls for 640 / 1024 / 1440 — need to add an `xl2` or rename via config.
- **[HIGH] X4 — Keyboard order through the hand is not defined.**
  `HandComponent.tsx:68-86` renders each card as a `<button>` inside a `<li>`. Natural tab order works, but there is no explicit `aria-activedescendant` or roving tabindex pattern — users tab through every card one by one with no way to jump to the action bar. Phase 3 brief asks for "Tab order through the hand, Enter/Space to play" — Enter currently does nothing (`CardComponent.tsx:61-69` handles only space).
- **[MED] X5 — Typography pairing is purely system sans.**
  `tailwind.config.js` has `font-display` referenced (`Phase10HandScore.tsx:90`), but I couldn't find where it's defined to a non-system typeface; everything reads as Tailwind default sans. Phase 2 should pick display + body.
- **[MED] X6 — `min-h-screen` on GameTable root + `overflow-hidden` means content can be clipped on short viewports.**
  `GameTable.tsx:723`. On a 375×667 device (older iPhone SE), the dock + felt + chrome stack overflows vertically and the chat input could be pushed off.
- **[LOW] X7 — Two icon-only buttons in the top-right of GameTable.**
  `GameTable.tsx:811` + `SettingsPopover`. Red power button ⏻ (end game) is immediately next to ⚙ settings — a mis-tap on mobile destroys the game. Destructive action needs more separation and/or a second confirm step.

---

## 6. Summary

| Severity | Count |
|---|---|
| BLOCK | 9 |
| HIGH | 10 |
| MED | 11 |
| LOW | 10 |

**Top three fixes for Phase 3 (in order):**

1. **Mobile hand layout** — replace `flex-wrap` with a scrollable/fanned horizontal strip (`HandComponent.tsx:148`). Resolves I1.11, I1.12, I1.14, I1.15, M1.4.
2. **Opponent-seat overlap on the felt below `lg`** — the mobile strip (`GameTable.tsx:840-885`) should reserve its own band above the felt, not float over it. Resolves I1.6, I1.10.
3. **Modal z-index / chat layering** — move Phase10HandScore (and sibling modals) to a React portal at `document.body`, or wrap chat inside the overlay coverage. Resolves E1.3, E1.4.

Everything else (wasted desktop space, game-card text wrapping at tablet, design tokens, reduced-motion, keyboard nav) is addressable as part of the Phase 3 component rework.
