# Responsive Redesign — Annotated Summary

Changes from the current [apps/frontend/src](../apps/frontend/src) implementation, and why.

## What stayed

- **Brand palette** (night + brass + felt + parchment + indigo/sky) — preserved verbatim from `tokens.css` and `tailwind.config.js`. No new colours introduced.
- **Typography choices** — Fraunces for display, Manrope for body. The existing font stack is kept; only the ramp is tightened.
- **Content + copy** — every string is drawn from the existing concept (Phase 10, Cribbage, etc.). No new features or pages invented.
- **Navigation labels** — Home, Lobby, Play, Leaderboard, Settings, Credits. Matches the existing pages directory.
- **Core flows** — sign-in, browse rooms, sit at a table, play a turn, open chat, view leaderboard. No flow was cut or reordered.

## What changed and why

### Header + navigation

| Before                                                                                          | After                                                                                                                | Why                                                                                            |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Inline buttons wrap to 2 rows on mobile; no drawer; `hidden sm:inline` hides label partway.   | Mobile: 44×44 hamburger + left-sliding drawer with scrim. Tablet: inline nav. Desktop: full nav + sticky blur.       | Drawer pattern is predictable on every phone. Never wraps. All primary nav fits without clipping. |
| Sign-in CTA lives in hero only.                                                                 | CTA also lives in the right of the header on every breakpoint (hamburger / brand / CTA).                             | Keeps sign-in one tap away on mobile, matching real product patterns.                          |

### Game table (the critical piece)

| Before                                                                                                   | After                                                                                                                               | Why                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fixed `880 × 520` felt with absolute-positioned radial seats ([GameTable.tsx:56-57](../apps/frontend/src/components/table/GameTable.tsx#L56-L57)). | Two distinct layouts: a stacked "lanes" layout < 1024, radial only ≥ 1024. Felt uses `aspect-ratio: 16/10` and `width: 100%`.      | The radial layout is a desktop-only pattern. On phones and iPads, stacked lanes are readable and thumb-safe. |
| Player seats have `min-w-[110px]` + absolute positions, overflowing 360px.                              | Mobile: opponents become a horizontal snap-scroll strip. Seats are 140–180px cards that swipe sideways.                             | The opponent list is already ordered — horizontal scroll with snap keeps context without crowding the felt.   |
| Cards at a global 48×72 size, no further shrink.                                                         | `width: clamp(40px, 10.5vw, 72px)` with `aspect-ratio: 2/3`.                                                                       | Cards fit 10 in a single row at 360px, expand smoothly to 72px on tablets and up.                             |
| Chat panel `max-h-60` (240px) eats half a mobile viewport.                                               | Mobile: chat is a bottom sheet + FAB (opens to 60vh on demand). Desktop: docked 320px right-side panel.                             | Chat is a secondary affordance on mobile — hidden by default, one tap to open. Desktop users keep it docked.   |
| Action bar buttons wrap row-2 when total width > viewport.                                              | Sticky pill bar at the bottom of the felt column, buttons allowed to wrap but with compact sizing (8/14 padding at 14px).           | Always visible, never overlaps hand, shrinks cleanly.                                                         |

### Leaderboard

| Before                                                                        | After                                                                                                     | Why                                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Raw `<table>` with 5 columns, no overflow wrapper ([LeaderboardTable.tsx:88](../apps/frontend/src/components/leaderboard/LeaderboardTable.tsx#L88)). | Mobile: stack-of-cards (rank chip + player + score). Tablet+: table reappears. | Tables of 5 cols are unreadable at 360px; the card list keeps the same data but respects the viewport. |

### Spacing + type

- Introduced explicit **CSS custom-property tokens** (`--s-1` … `--s-24`, `--fs-h1` … `--fs-caption`). The prototype proves they can be driven responsively from a single `:root` block with a handful of media queries. Porting to Tailwind would mean extending `theme.spacing` and `theme.fontSize` with the same ladder.
- Spacing is now **applied consistently** everywhere — hero, sections, cards, form fields. No more ad-hoc `mt-10`, `mt-12`, `pt-20` tokens appearing in random places.

### Forms

| Before                                                                             | After                                                                                                   | Why                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Input font size varies; some at 14px, which causes iOS Safari to zoom on focus. | All inputs at 16px, `min-height: 48px`, labels always above the field (never placeholder-as-label).   | Stops the iOS zoom jump. Makes labels available to screen readers.    |
| Fields stack single column everywhere.                                            | Paired fields (Timezone + Async window) collapse to 1-col < 768px, 2-col ≥ 768px.                      | Efficient use of space without ever squeezing fields below 320px.     |

### Modals

- `max-width: min(520px, calc(100vw - 32px))` so there's always a 16px gutter on 360px. Previous `mx-3` gave only 12px.
- Animations: `transform: translateY(16px) → 0` + fade, 260ms. Respects `prefers-reduced-motion`.

### Accessibility

- Consistent `:focus-visible` treatment (2px cyan ring, 2px offset) applied globally via one `:where()` selector — can't be forgotten per-component.
- Every tap target is 44×44 minimum, including icon-only buttons like the hamburger and chat FAB.
- `prefers-reduced-motion` kills all non-essential animation.

## What's out of scope (deliberately)

- **Real data wiring.** The prototype's content is static. When porting to React, feed these layouts with the existing Zustand stores and hooks.
- **Cribbage board.** It has its own responsive concerns (peg animations across a long board) — worth a second prototype pass.
- **Admin pages.** They're desktop-heavy by nature; a mobile redesign would likely replace tables with cards in the same pattern the leaderboard uses.
- **Turn-timer animations.** Keep the existing 2.2s turn-pulse; it's a small performance hit but a strong UX cue.

## How to port this

1. **Extend `tokens.css`** with the new `--s-*` spacing scale and the `--fs-*` type ramp.
2. **Update `tailwind.config.js`** `theme.spacing` to match the scale, and `theme.fontSize` with the same ramp.
3. **Replace `GameTable.tsx`'s felt sizing** (`FELT_W`/`FELT_H`) with a fluid container using `aspect-ratio: 16/10` + `clamp()` for minimum/maximum dimensions. Gate `RadialSeats` on `useMediaQuery('(min-width: 1024px)')`.
4. **Build a `useDrawer()` hook** for the mobile nav + chat sheet. Reuse between lobby header and table chat.
5. **Split `LeaderboardTable.tsx`** into `LeaderboardTable` (tablet+) and `LeaderboardList` (mobile). Switch via a single breakpoint check, not two.
6. **Add an `OpponentStrip` component** for the mobile game table — it reads the same player array the desktop `RadialSeats` does, just renders horizontally.
7. **Audit every `w-[...]`, `h-[...]`, `min-w-[...]` in Tailwind classes** and either replace with responsive variants or remove outright.

## Files in this folder

- `index.html` — standalone clickable prototype. Open directly in a browser. Nav via the header or drawer; resize the window to watch reflows. A small HUD at the bottom of the screen shows the current breakpoint tier.
- `responsive-spec.md` — the full spec (breakpoints, grid, type, spacing, component reflow, accessibility).
- `CHANGES.md` — this file.
