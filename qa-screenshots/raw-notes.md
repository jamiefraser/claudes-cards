# Canasta QA — Raw Notes (running log)

## Desktop 1v1 (1920x1080) — Session 1

### Setup
- Auto-logged in as test-player-1
- Created Canasta room "QA-1v1-Desktop", 2 max players
- Started game with 1 bot
- Initial hand: 15 cards
- Deck: 74 cards
- Discard pile starts with A♣ exposed
- Initial meld threshold: 50 pts

### Layout observations
- Table felt is fixed at 880x520 px, leaving large empty horizontal margins on 1920px desktop
- Hand list is centered below table
- Bot 1 seat is at top-center showing "16 cards" + face-down stack image (only 7 cards visible in stack image despite "16 cards" label — seems decorative not actual count)
- Deck (74→after-draw) and Discard sit horizontally adjacent in middle of felt
- Action buttons appear ABOVE the hand
- Player chip + sort buttons below the hand
- Chat panel on right
- "Rules" tab on left edge
- Top-left corner: "Room ED3202 · Hand 1/1", turn indicator, initial meld threshold pill
- Top-right: end-game (red), settings (gear) buttons

### Initial draw
- Clicked "Draw Deck" → deck went from 74 → 72 (drew 2 cards, hand 15→17). Standard Canasta draws 1 from stock; **drawing 2 is unusual**, may reflect engine rule but worth verifying. (Hand later clarifies — likely a Red 3 replacement is happening but neither drawn card was a Red 3, so this looks like a 2-card draw rule.)

### Card hover
- Hover effect on hand cards is **extremely subtle** — only a thin border outline, no elevation, no glow, no lift. Hard to perceive — needs a clearer visual hover state. (P3 polish)

### Card selection — single card
- Clicking card lifts it visibly above adjacent cards (good z-index)
- Selected card extends DOWN past the hand row baseline by ~10–15 px (the bottom of the elevated card protrudes below the row container)
- Selected card overall renders ABOVE neighbors (z-index correct on top layer)

### Meld attempt with under-threshold points — SILENT FAILURE (P0/P1)
- Selected three 6s (6♣, 6♣, 6♥) for a set. Total pts = 15.
- Initial meld requires 50 pts.
- Clicked Meld → selection cleared, hand unchanged, **no error toast/dialog/inline message**.
- User has zero feedback that the action was rejected, why, or what they should do.
- This is a critical UX defect — it makes the game unplayable for new users.
- Repro: select any low-value valid set (e.g., 3 fours), press Meld during the initial-meld phase.
- **Severity: P0 (rules enforcement / feedback)** — actively misleads users into thinking the app is broken.

### Meld button enabled state
- Even when only 1 card is selected (which can never form a valid meld), the Meld button shows ENABLED (orange).
- It only becomes properly disabled (gray) once you click meld and selection clears.
- **Severity: P2** — should disable Meld until selection is a candidate meld (≥3 same-rank or wild+naturals matching extension).
