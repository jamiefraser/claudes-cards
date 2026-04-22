# cardsjd.com Cribbage — observations

**Source:** `https://cardsjd.com/cribbage/game/` — played as Guest, Easy bot, one full deal through pegging + show.
**Screenshots:** `design/ref-cardsjd/*.png` (12 frames covering: landing → menu → deal → discard → pegging → show → next deal).

This is reference material for the redesign — NOT a target to clone. Captures patterns that read clearly at small-canvas scale and that our implementation could lean into.

## Layout (the big one)

**Left rail:** opponent avatar + score at top, user avatar + score at bottom. Each avatar is a 120×160-ish portrait, opaque, with name + numeric score baked in. A small "Details" chip hangs under the opponent.

**Centre:** the play area. Deck stack at left, pegging/cut cards in the middle, player's hand across the bottom when the user is to act.

**Right rail:** the full cribbage board, vertically oriented, serpentine U-track. Takes roughly 20% of the horizontal space on desktop, always visible.

This "left = players, right = board, centre = action" split is **a different layout than ours** — we currently have players on top and bottom of the felt. cardsjd.com's vertical-avatar layout frees the centre for gameplay and keeps the score board always in peripheral view. Worth considering at wide viewports.

## Board shape (confirmation)

Serpentine, exactly the image you linked. Three lanes rendered as stripes (red / blue / red on the outer two turns, single red stripe across the centre for the goal). U-turn at one end. Small holes grouped visually in fives. Pegs rendered as round push-pins with a visible shadow, two pegs per player (leapfrog pattern — front peg = current, back peg = previous position).

**What our serpentine is missing:**
- The board's **red-and-blue lane chrome** — cardsjd.com uses coloured stripes along each lane as identity. Ours uses a brass inlay groove. Theirs is louder but more "cribbage-like."
- **Pegs look like real pegs** — round ball-head with stem and shadow. Ours are flat circles. Adding a simple radial gradient + shadow would double the material feel.
- **The goal hole at 121 is a visually distinct plate** with a golden/brass ring and a small "121" mark. Ours has a brass-rimmed hole but no numeric label.

## Score announcements — this is where they win

Every scoring event surfaces a **big, centre-ish black text banner** with the delta and the reason:

- "+1 last card" (end of pegging leg)
- "+7 Hand" (show phase count)
- "Pegging Score 4 on round 1" (achievement popup with gold coin)
- "Welcome to Pegging" (phase transition with a "II" badge)

Three specific patterns I'd steal:

1. **Delta + label, one line, huge.** No animation, just "+4 Fifteen" or "+1 for his nobs" appearing for ~2s. It's the most satisfying piece of feedback in the whole UI. Way better than our current silent peg movement.
2. **Phase-transition banner.** When pegging starts, a small dark card appears near the top: "Welcome to Pegging — Pegging Score 4 on round 1." When the show starts, similar banner. Acts as a section divider during a long turn.
3. **Running count is prominent.** During pegging, the big numeric ("9" or "11") is displayed in bold white to the right of the pegging pile. Not inside the pile, beside it. Ours currently doesn't surface the count at all — it's implicit in the action bar.

## The pegging pile

Cards from earlier plays in the leg are **dimmed (lower contrast) and slightly fanned**. The most recent 1–2 cards are at full brightness. When a new card is played, it slides from the player's hand into position next to the existing pile, brightness flash on landing.

**This teaches the state at a glance**: "these are the 4 cards already counted, these 2 are the new additions." Our current cribbage pegging area (from the current engine) just stacks them — no dim/bright contrast.

## The show (counting)

When it's a player's turn to count:

1. Their hand is **raised and turned face-up** in the centre, next to the starter card.
2. The OTHER player's hand + the crib are shown **greyed out / dimmed** — makes clear whose turn to count it is.
3. The +N label appears beside the hand with the category ("+7 Hand"), holds for ~1.5s.
4. Individual combinations aren't individually highlighted (no "Fifteen 2, Fifteen 4, pair 6" walk-through) — it's just the total. Missed opportunity, but makes the UX faster.

## Sounds

I had audio off to keep the MCP session clean, but the UI has a speaker icon bottom-left, and the in-app achievement "Welcome to Pegging / Pegging Score 4 on round 1" is a typical **gamification pattern** (gold-coin XP icon, roman numeral badge "II" = player's running level, 15 points earned). That's app-store polish; not sure it belongs in our design but noting it.

## Card motion

Deal animation: cards fly one-at-a-time from the deck to each player's position. About 80ms per card, 6 cards = ~500ms total. Smooth, not bouncy. The starter card flip is a separate gesture — you click an offset card in the splayed deck, it flips face-up with a quick rotation, lands to the left of the deck.

Discard-to-crib: clicking a card flies it to the crib stack. ~300ms.

Pegging play: clicking a card moves it from hand to the pegging row. ~300ms with a slight ease-out.

No bouncy overshoot. No rotation tricks. Motion is matter-of-fact — the game is the interesting thing, not the animation.

## Specific thefts for our implementation

1. **Add running-count badge during pegging.** Big bold number next to the pegging pile. Reset to 0 at each "Go." Currently absent in our UI.
2. **Add score-delta announcements.** Every time `frontPeg` advances, surface a `+N Reason` label for ~1.8s on the board. Would replace our quieter SR-only live-region-with-no-visual feedback.
3. **Phase-transition banners.** "Discarding" → "Pegging" → "Show" → "Next hand" — a small toast-like banner that fades in and out.
4. **Peg appearance.** Our pegs are flat circles; cardsjd's look like real pegs with highlight + shadow. One radial gradient + drop-shadow away.
5. **Dim the non-active elements during show.** Makes "whose turn" obvious without extra text.
6. **Goal hole label.** A small "121" glyph inside or beside the goal hole.
7. **Pegging pile — dim old cards, bright new ones.** Small opacity trick.
8. **Starter-card = cut-card UX.** Players select from a splayed deck (not a fixed central card) — keeps hands busy between deals. Our cribbage engine emits a cut-card directly; we could still dress it as a selected-from-spread animation.

## What NOT to steal

- **The wood-panel bg gradient.** Ours is already themed per-palette; cardsjd.com has a single hard-coded mahogany look and it clashes at smaller widths.
- **The "Details" chip under avatars.** Unclear affordance — clicking it opens a stats panel, but the chip is sized too small to discover.
- **The tiny back arrow in the top-left.** Easy to miss. Our lobby nav (header row) is clearer.
- **Score as part of the avatar image.** They paint the score directly onto the portrait. Awkward at different avatars; we'd lose that to theme swaps.

## Comparison artefacts

| cardsjd | our current |
|---|---|
| Score delta surfaces as "+4 Fifteen" text | No visual surfacing; SR-only announcement |
| Running pegging count: big number | Not displayed |
| Pegging pile: dim old / bright new | Uniform brightness |
| Pegs: 3D-ish push-pins | Flat circles |
| Phase transitions: toast banner | No transition feedback |
| Dealing motion: card-by-card arc | We deal server-side, no animation |
| Goal hole: small `121` glyph | Just the brass-rimmed well |
| Board stripes: red/blue identity | Brass inlay (subtler) |

Stop-list: wood panel clash, tiny back button, score-on-avatar.
