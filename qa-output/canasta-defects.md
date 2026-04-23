# Canasta QA Defect Report
_Date: 2026-04-22 · Sessions completed: 4 · Viewports tested: Desktop 1920×1080, Tablet 1024×768 (landscape), Tablet 768×1024 (portrait), Phone 390×844 (portrait), Phone 844×390 (landscape) · Bot configs: 1v1, 1v3_

> Screenshots are stored in the sibling `screenshots/` directory.
> Code references are repo-relative paths.
> Note: per the test brief I targeted `/mnt/user-data/outputs/`, but that path was not writable in this sandbox; outputs were written under `qa-output/` inside the repo workspace.

---

## Executive Summary
Canasta has two **systemic, P0-class** defects that block normal play and cascade into many user-visible symptoms:

1. **Silent action failures.** All in-game engine errors (illegal melds, illegal pickups, under-threshold initial melds, etc.) are swallowed. There is no toast, no inline message, no console error. Root cause: the `game_error` socket event is only handled in `WaitingRoom.tsx`; once the game is live and `GameTable` is mounted, no component subscribes to it, so the engine's "specific error code that gets surfaced to a toast" (per the comment at `apps/frontend/src/components/table/ActionBar.tsx:151–152`) never reaches the user.
2. **Multi-meld layout cannot be submitted.** `handleCanastaMeld` (`ActionBar.tsx:198–229`) always packs the entire selection into ONE meld request. Reaching the 50-pt initial-meld threshold from a typical opening hand normally requires combining several melds in one turn (Standard rules). Because the UI cannot express that, many opening hands have no legal initial meld at all — the player can only watch the bots play melds while their own attempts silently fail.

A third systemic defect — **layout duplication between the "lateral" and "in-felt" meld zones** — affects every tested viewport and shows opponent melds twice (or shows mobile-only widgets on desktop), wasting screen real estate and confusing turn flow.

Top three themes in priority order: (1) **lack of feedback** for any failed action, (2) **fundamental melding workflow gap**, (3) **broken responsive layout duplication**.

---

## Critical Defects (P0 — blocks play)

### DEF-001: All in-game engine errors are silently dropped
- **Severity**: Critical
- **Area**: Rules enforcement / feedback / sockets
- **Viewports affected**: All
- **Bot configs affected**: 1v1, 1v3 (and by inference all)
- **Reproduction**:
  1. Start any Canasta game.
  2. Draw, then attempt any illegal action: meld < 50 pts initial; meld with mixed-rank selection; Take Top with non-matching hand; etc.
- **Expected**: A visible error message ("Initial meld must total at least 50 points", "Selected cards do not form a valid meld", etc.) — explicitly described by the code comment at `ActionBar.tsx:148–152`.
- **Actual**: Selection clears, hand and table are unchanged, no toast or dialog appears, no console error logged.
- **Screenshots**: `desktop-1v1-meld-attempt-low-points.png`, `desktop-1v1-meld-3sevens-attempt.png`, `desktop-1v1-meld-KK2-attempt.png`, `desktop-1v3-meld-KKwild-40pt.png`, `desktop-1v1-take-top-attempt.png`
- **Root cause**: `apps/frontend/src/hooks/useGameState.ts` subscribes only to `game_state_sync`, `game_state_delta`, `bot_activated`, `bot_yielded`. The `game_error` event is handled only in `apps/frontend/src/components/table/WaitingRoom.tsx:117–126`; nothing inside the live `GameTable` listens for it. Server emissions of `game_error` while the player is at the table are dropped on the floor.
- **Suggested fix**: Subscribe to `game_error` in `useGameState` (or a co-located hook) and forward to the existing `useToast()` provider used elsewhere. Add a Vitest covering the listener wiring; add a Playwright spec that asserts a toast on a deliberately-illegal action.

### DEF-002: Cannot lay down a multi-rank multi-meld in one click → initial meld unreachable
- **Severity**: Critical
- **Area**: Melding workflow / engine-UI contract
- **Viewports affected**: All
- **Bot configs affected**: 1v1, 1v3
- **Reproduction**:
  1. Start a Canasta game and draw until your hand contains, say, three 6s, three 7s, and K+K+wild — totaling 70 pts in three valid melds.
  2. Multi-select all 9 of those cards.
  3. Click **Meld**.
- **Expected**: All three melds laid down, initial-meld threshold satisfied, the cards leave the hand and appear in the player's meld zone.
- **Actual**: Selection clears, **nothing** happens (silent rejection — see DEF-001). The handler at `ActionBar.tsx:198–229` packs every selected card into a single meld request (`emitAction('meld', selectedCardIds)`), so the engine sees one meld whose cards span four ranks and rejects it.
- **Why this is critical**: For a typical opening hand, no single rank can clear 50 pts (4 of a kind + wilds maxes around 4×K + wild = 60, but that requires four naturals of the same rank — rare on a deal of 11–15 cards). Therefore players essentially **cannot make their initial meld** without batching several melds in one turn. The bot can do it (it builds three sets in one move — see `desktop-1v1-after-bot-meld.png`), but the human-facing UI cannot.
- **Screenshots**: `desktop-1v1-multi-select-9cards.png`, `desktop-1v1-after-multi-meld.png`
- **Suggested fix**: Group `canastaSelected` by natural rank in `handleCanastaMeld`; if more than one rank is present, send `{ melds: [{ cardIds: [...] }, { cardIds: [...] }, ...] }` (the engine already accepts that shape per the comment at `ActionBar.tsx:184–186`). Consider a meld-builder UI (drag cards into named "slots") for clarity, but the simple group-by-rank solves the immediate gap.

---

## High Defects (P1 — significant playability impact)

### DEF-003: Bot avatar + meld zone duplicated above and inside the felt at all tested breakpoints
- **Severity**: High
- **Area**: Layout / responsive design
- **Viewports affected**: 1280×720, 1024×768, 768×1024, 390×844, 844×390 (i.e., everything below the 1920×1080 baseline)
- **Bot configs affected**: 1v1 confirmed; expected to repro in all configs
- **Reproduction**:
  1. Start a Canasta game; let the bot make at least one meld so the meld zone has content.
  2. Resize the window to anything narrower than ~1440px or load on a tablet/phone.
- **Expected**: One bot panel + one meld zone per opponent.
- **Actual**: Two stacked renderings appear simultaneously — a "lateral" tablet/mobile rail above the felt **and** the desktop-only in-felt rendering. The DOM contains two elements with `aria-label="Bot 1's melds"` (verified via `document.querySelectorAll('[aria-label*="melds"]').length === 2`). The two share data but render at different sizes; on phone (390 wide), the upper rail also overflows the viewport by ~24 px.
- **Screenshots**: `desktop-1v1-resized-1280.png`, `tablet-landscape-1024-bot-meld.png`, `tablet-landscape-1024-bottom.png`, `tablet-portrait-768.png`, `phone-portrait-390-fullpage.png`, `phone-landscape-844.png`
- **Suspected cause**: The mobile/tablet rail uses `lg:hidden`, but the in-felt rendering is not wrapped in `hidden lg:block` — so above the lg breakpoint both render. (Note also: the inside-felt rail's parent has `display:none` set by `lg:hidden` only on widths < `lg`, leaving the desktop felt to also try to render its own copy.)
- **Suggested fix**: One source of truth for the meld zone, with a single breakpoint that swaps placement.

### DEF-004: Bot meld cards inside the felt are nearly unreadable at desktop sizes
- **Severity**: High
- **Area**: Visual hierarchy
- **Viewports affected**: 1920×1080 (baseline), 1280×720 in-felt copy
- **Bot configs affected**: 1v1, 1v3
- **Reproduction**: Trigger any bot meld; observe the in-felt "Bot 1's melds" zone.
- **Expected**: Opponent melds clearly visible at a glance.
- **Actual**: Cards are rendered at `transform: scale(0.75)` of an already-small 48×72-px base in a 306×116-px container. With typical sets of three at `-space-x-2.5` overlap, individual ranks are illegible without zooming. The scaled copies appear as a vague tan band on the felt; only the parchment label "Bot 1's melds" is readable.
- **Screenshots**: `desktop-1v1-after-bot-meld.png` (full page; barely visible band), `desktop-1v1-meld-area-zoom.png` (cropped: cards are there, but tiny)
- **Suggested fix**: Drop the `scale(0.75)`, expand the container width on the felt for desktop, or rely solely on the lateral rail (DEF-003 fix should converge with this).

### DEF-005: Rules panel has near-invisible text contrast
- **Severity**: High (a11y)
- **Area**: Rules panel / accessibility (WCAG AA)
- **Viewports affected**: All
- **Reproduction**: Click the "Rules" tab on the left edge.
- **Expected**: Section titles ("Overview", "Setup", "The play", "Melds", "Scoring") and footer attribution legible at default zoom.
- **Actual**: Section titles render in a dark ochre on near-black background; footer attribution is essentially invisible.
- **Screenshot**: `desktop-1v1-rules-panel.png`
- **Suggested fix**: Lift body and heading colors to at least WCAG AA (4.5:1) against the panel background.

### DEF-006: Phone hand cards have ~20px effective tap target between cards
- **Severity**: High (mobile usability)
- **Area**: Touch targets / hand layout
- **Viewports affected**: 390×844, 844×390
- **Reproduction**: At 390×844 with a 17-card hand, attempt to tap any card except the rightmost.
- **Expected**: ≥44×44 px tap area per card (Apple/Google guidance).
- **Actual**: Card render width is 48 px but inter-card horizontal gap is only 20 px — so the only un-occluded portion of any non-rightmost card is a 20×72-px strip. Below the 44×44 minimum and prone to accidental adjacent-card selection.
- **Screenshot**: `phone-portrait-390-fullpage.png`
- **Suggested fix**: Increase minimum gap on small viewports (e.g., switch to a 2-row fan), or expand each card's hit-test area independently of its visual overlap.

---

## Medium Defects (P2 — noticeable but workaroundable)

### DEF-007: Discard pile has no card-count indicator
- **Severity**: Medium
- **Area**: Information display
- **Viewports affected**: All
- **Reproduction**: Play through a few turns and observe the discard pile next to the deck.
- **Expected**: Numeric badge analogous to the deck's "74", since pile size matters strategically (worth picking up or not).
- **Actual**: Discard shows only the top card's face; size is unknowable. Clicking the pile (button `[aria-label="Discard pile"]`) appears to be a no-op outside the take-discard turn moment.
- **Screenshot**: `desktop-1v1-after-draw.png`, `desktop-1v3-discard-click.png`
- **Suggested fix**: Add a count badge identical in style to the deck's; consider a hover/tap preview that fans the top few cards (read-only).

### DEF-008: Meld button is enabled with selections that can never form a valid meld
- **Severity**: Medium
- **Area**: Action affordance
- **Viewports affected**: All
- **Reproduction**: After drawing, select a single card. Observe the Meld button (orange, enabled).
- **Expected**: Meld disabled when the selection can't possibly meld (e.g., a single non-wild card, or a multi-rank selection with no extendable target).
- **Actual**: Meld stays enabled and clicking it falls into DEF-001 (silent failure).
- **Screenshot**: `desktop-1v1-card-selected-1.png` (single card selected, Meld is bright orange)
- **Suggested fix**: Pre-validate the selection in the FE (`canastaCanMeld` already exists at `ActionBar.tsx:193–194`; tighten its predicate to require `>= 3` cards and either a single natural rank or the all-wild extend path).

### DEF-009: Selected card extends below the hand row baseline by ~10–15 px
- **Severity**: Medium
- **Area**: Card stacking / layout
- **Viewports affected**: Desktop, tablet
- **Reproduction**: Click a hand card; compare its bottom edge to neighboring (unselected) cards.
- **Expected**: Selected card lifts upward only.
- **Actual**: Selected card grows in both directions, so its bottom protrudes past the hand container's baseline. (Z-index is correct — the card sits above its neighbors — so this is purely a sizing/anchor issue.)
- **Screenshot**: `desktop-1v1-card-selected-1.png`
- **Suggested fix**: Anchor the selected-state transform to `transform-origin: bottom`, or apply `translate-y(-Npx)` instead of `scale()`.

### DEF-010: Two simultaneous Browse/Create dialogs when entering Canasta from the lobby card
- **Severity**: Medium
- **Area**: Lobby modal stack
- **Viewports affected**: Desktop (others not specifically tested)
- **Reproduction**: From the lobby, click the Canasta card body (not specifically the Create button).
- **Expected**: Browse Rooms opens.
- **Actual**: Both Browse Rooms and Create Room dialogs open; the focus jumps to the inner one but the outer remains visually present underneath.
- **Suggested fix**: Make the article click open Browse only; require an explicit Create-Room button click for the create modal. (Mostly a lobby concern; surfaced here because it affected room setup during testing.)

---

## Low Defects (P3 — polish)

### DEF-011: Hover state on hand cards is barely visible
- **Severity**: Low
- **Reproduction**: Hover over any hand card.
- **Expected**: Clear lift, glow, or border highlight.
- **Actual**: Almost imperceptible thin outline.
- **Screenshot**: `desktop-1v1-hover-card.png`
- **Suggested fix**: Add a transform translate-y on hover (–4 px is already in the CSS for the card button — need to verify why it's not visibly firing in the hand context).

### DEF-012: Bot face-down "stack" image always shows 7 cards regardless of true count
- **Severity**: Low
- **Reproduction**: Watch a bot's hand count decrease as it plays; the face-down stack image to the right of "9 cards" still renders 7 fanned card-backs.
- **Expected**: Decorative — could omit or scale with count.
- **Actual**: Misleading at a glance ("looks like 7 cards but says 9").
- **Suggested fix**: Either hide the image entirely once an exact count is shown, or generate a stack of `min(count, 7)` overlapping cards.

### DEF-013: "Black 3" discards offer no visible turn-relevant cue
- **Severity**: Low
- **Observation**: When a bot discards a black 3 (a "freezer" in Canasta), the discard pile silently freezes for the next player. There's no indicator on the pile (e.g., a chain icon, a different border) that the pile is currently un-pickup-able for everyone but the player who can extend a meld with a single card.
- **Suggested fix**: Show a small "freeze" badge on the discard pile when its top is a black 3 or a wild.

---

## Viewport-Specific Issues

### Desktop (1920×1080)
- DEF-004 most painful here: in-felt meld zone is too small at this width to be useful. The lateral panel (DEF-003) is also visible above the felt at narrower-than-1440 desktop widths, but at full HD only the in-felt rendering shows.

### Desktop (1280×720)
- DEF-003 fully visible: lateral bot panel **and** in-felt panel both render. Chat collapses to a tab on the right edge.

### Tablet (1024×768, landscape)
- Same DEF-003 layout duplication. Bot avatar appears outside the felt, an empty-looking "0 PTS" chip sits inside the felt (an orphan from the desktop layout).
- Page is too tall — the player must scroll between the felt and their hand, making real-time turn-taking awkward.

### Tablet (768×1024, portrait)
- DEF-003 again. The in-felt meld zone is right-clipped: the third set's right edge sits at the felt boundary, partially hiding the rightmost card.

### Phone (390×844, portrait)
- DEF-003 + DEF-006 + meld-zone overflow. The top "Bot 1's melds" rail is rendered at 402 px wide but the viewport is 390 px, so the rightmost meld is clipped (no inner scroll).
- "0 PTS" chip orphan inside the felt is more visible here because the felt is so narrow.

### Phone (844×390, landscape)
- Layout is laid out *vertically* even in landscape: bot panel + lateral meld zone + felt + action bar + hand all stacked top-to-bottom. The viewport (390 high) shows essentially only the bot panel; the player must scroll to see the felt and again to see their hand. Effectively unplayable in landscape.

---

## Recommendations for Next Iteration

1. **Wire up `game_error` in `useGameState` (or a sibling hook) and route it to `useToast()`** — fixes DEF-001 and surfaces every other engine-side rule violation. Should take a single-PR's worth of work and immediately makes the rest of the game testable for users.
2. **Group the canasta meld payload by rank in `handleCanastaMeld`** — fixes DEF-002. The engine already accepts `{ melds: [...] }`. Optionally introduce a meld-builder UI later, but the group-by-rank is enough to unblock initial melds.
3. **Decide on a single meld-zone presentation per breakpoint** — fixes DEF-003 (and converges with DEF-004). Either drop the in-felt rendering entirely and rely on the lateral rail, or guard the in-felt one with `hidden lg:block` and remove the rail at lg+.
4. **Run a contrast pass on the rules panel** — fixes DEF-005. Likely a one-line theme token change.
5. **Architectural concern**: the action error path needs a contract test. Right now there's a comment promising the toast surfaces, code that emits the error from the engine, and no listener — three layers without anyone owning the join. A small Playwright spec ("attempt invalid meld → assert toast text") would have caught DEF-001 immediately and is cheap to add.

### Suggested testing additions
- Visual-regression snapshots for the meld zone at every breakpoint (`lg`, `md`, `sm`).
- Engine-error-path Playwright spec per game (Canasta, Phase 10, Rummy, Gin Rummy — anything that emits `game_error` mid-game).
- Hit-test test for hand cards at each phone width (every card's bounding box must include a 44×44 region not occluded by a sibling).

### Coverage gaps (untested due to time / blocker)
- **Could not complete a hand** in any session because of DEF-001/002 — initial meld unreachable, so scoring screens, round transitions, win celebration, and full-pile pickup were not exercised end-to-end.
- **1v2 (3-player)** session was deferred since 1v1 + 1v3 already exhibit identical defect patterns; expected to repro the same.
- **Drag-and-drop of cards** was not tested; the GameTable wires up `@dnd-kit` (`GameTable.tsx:8–17`) but no drag affordance was visible during the Canasta sessions.
- **Wild-card meld extension via the `CanastaMeldTargetModal`** was not exercised because no melds were ever successfully laid down (DEF-002).
- **Add cards to existing melds** (the user's flagged "known problem area") could not be exercised for the same reason.
- **Round-end / score update** behavior unverified — the bot's pts column stayed at 0 throughout, but it's unclear whether scores are intended to update only at round end.
- **Resize-mid-game** at the desktop ↔ tablet boundary (1024–1280 px) was tested visually but not for state retention; no obvious state loss observed.
