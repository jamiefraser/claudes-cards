# Phase 2 — Design Directions

Three directions for the redesign, chosen to be maximally distinct from each other and from the current dark-slate / brass look (which would preserve the responsive issues from Phase 1 without contributing a new identity).

Each commits to a single aesthetic point of view. Pick one and the rest of Phase 3 follows.

---

## Direction 1 — "Le Salon"

**Vibe:** *The New Yorker* opened a card club — literary, warm-paper, quiet, nothing on the screen raises its voice.

### Typography
- **Display · [Fraunces](https://fonts.google.com/specimen/Fraunces)** (Google Fonts)
  Variable optical-sizing — `opsz 144` for headings (calmer, warmer), `opsz 14` for smaller marks. Use weight 400/500 only; no 700+ (too loud for the tone).
- **Body · [Commissioner](https://fonts.google.com/specimen/Commissioner)** (Google Fonts)
  A humanist sans with flared terminals — reads beautifully beside Fraunces without going full serif-pair. Regular (350) body, 500 for labels.
- **Numeric · [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)** @ 500
  For scores, timers, card-count pills — gives tabular rhythm.

### Palette
```css
/* Le Salon — warm paper, muted felt, single ochre accent */
--paper:          #f4ead8;  /* base surface (warm parchment, never white) */
--paper-raised:   #ede1ca;  /* cards, modals, elevated panels */
--paper-deep:     #e2d4b8;  /* inset wells, disabled fields */
--ink:            #1d1812;  /* primary text — warm near-black */
--ink-soft:       #3a3027;  /* secondary text */
--whisper:        #877457;  /* captions, metadata */
--hairline:       #c9b997;  /* rules / dividers (1px only) */
--ochre:          #b57b2d;  /* single action accent (buttons, active state) */
--ochre-hi:       #d29945;  /* hover / focus ring */
--burgundy:       #7b1e1d;  /* discard / destructive / warning */
--felt:           #2b3e2a;  /* table felt — muted forest */
--felt-light:     #3c5339;  /* felt highlight for wear/nap */
```
Dominant: paper. Accent: ochre. Felt is a quiet character. Burgundy is rare and earned.

### Motion language
- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (smooth decelerate) for almost everything. One easing curve, enforced by token.
- **Card draw:** 260ms translate from deck + 200ms opacity — cards *arrive*, they don't fling.
- **Card select:** 180ms lift (`translateY(-6px)`), paired with a 1px ochre hairline that ignites beneath the card (no glow, no shadow spread).
- **Discard:** 280ms glide to pile with a 4° rotation — the only rotation in the system.
- **Turn transition:** beneath the active player's name, a 1px hairline rule draws left-to-right over 320ms. Deliberate, literary, feels like a printed rule on a page.
- **Score increment:** tabular counter ticks up at 22ms per unit, no easing (mechanical typewriter feel).
- **Reduced-motion:** rotations drop to 0°, durations compress to 120ms, counters jump instantly.

### Mood reference
A Saul Leiter photograph through a rainy Paris window at 4pm. An open book of Cortázar stories on a marble café table, two playing cards slotted between pages as bookmarks, espresso and a small pitcher of milk. Wool, paper, brass, and one burgundy ribbon.

### Strength / trade-off
- **Strength:** ages well, reads as prestige, the literary pacing suits long async games (Cribbage, Canasta, Gin Rummy).
- **Trade-off:** reserved for louder games (Spit, War, Crazy Eights). Phase 10's bright card art needs gentle framing against warm paper — the felt contrast does the work there.

---

## Direction 2 — "Bodega Riso"

**Vibe:** A Saturday-afternoon social club pressed in risograph — warm, off-register, tactile, alive with cheap colour and paper grain.

### Typography
- **Display · [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque)** (Google Fonts)
  Variable width + weight + optical size — lets large titles feel characterful (wider at size 72, tighter at 18). Use weights 500–700.
- **Body · [Gelasio](https://fonts.google.com/specimen/Gelasio)** (Google Fonts)
  A warm text serif with slight quirks — reads like an old paperback. Regular 400, italics for chat lines.
- **Numeric · [Space Mono](https://fonts.google.com/specimen/Space+Mono)** @ 400
  For score tiles and countdowns — slightly comic monospace that plays well with the display.

### Palette
```css
/* Bodega Riso — cream, tomato, mustard, deep teal felt */
--cream:          #f8eed3;  /* base — warm, not white */
--cream-raised:   #f2e5c2;  /* cards / panels */
--cream-deep:     #ead49c;  /* inset wells */
--ink:            #1a1612;  /* text — very dark brown-black */
--ink-soft:       #3b322a;
--whisper:        #846f50;  /* captions */
--tomato:         #e24d2a;  /* primary action (play / confirm) */
--tomato-hi:      #ff6c4a;
--mustard:        #ecb33e;  /* secondary accent, dealer chip, highlights */
--teal-felt:      #0e4e54;  /* table felt base — deep teal, not green */
--teal-light:     #1c6b72;  /* felt weave highlight */
--mint:           #9cd3b6;  /* success, "went out", positive deltas */
--rose:           #d6557c;  /* tertiary accent, reactions */
--paper-grain:    rgba(26, 22, 18, 0.035);  /* noise overlay on surfaces */
```
Every surface gets a subtle `--paper-grain` noise layer + a 0.5% misregistration (a tiny CMYK-style offset on key chromes). Colour is loud but warm — no RGB gaming energy.

### Motion language
- **Easing:** `cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot) for cards — they *plop*. Secondary eases at `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Card draw:** 240ms with a 2px overshoot, tiny rubber-band at land.
- **Card discard:** ±3° random rotation, 200ms plop. Like tossing onto a paper pile.
- **Turn transition:** the dealer chip *stamps* into place — 200ms scale 1 → 1.08 → 1 with a brief `drop-shadow` pulse (rubber stamp).
- **Celebration (go-out, phase clear):** 8 paper-confetti squares in palette colours fall from the top with individualised rotations and delays, 900ms total.
- **Hover on cards:** a 2px cream halo (not a shadow) so cards feel like they've been lifted off a paper stack.
- **Reduced-motion:** all rotations + overshoots → 0, confetti skipped, stamp becomes a 120ms fade.

### Mood reference
A Tom Eckersley poster pinned to the wall of a Miami social club. Chipped Formica tables, sunlight through a striped awning, a spiral-bound score pad, a #2 pencil, condensation rings on the paper napkins. Loud conversation and good coffee.

### Strength / trade-off
- **Strength:** welcoming, social, photogenic, kids-through-grandparents. Looks distinctive in screenshots. Phase 10's bright card faces sit harmoniously in this palette.
- **Trade-off:** the tactile noise/misregistration trick needs careful performance work — halftone overlays + confetti animations are the expensive path. Reduced-motion path must be first-class.

---

## Direction 3 — "Obsidian Club"

**Vibe:** A film-noir backroom at midnight — confident, dark, cinematic, one acid-chartreuse accent carrying all the tension.

### Typography
- **Display · [Syne](https://fonts.google.com/specimen/Syne)** (Google Fonts)
  Expressive geometric sans — wide at heavy weights, tight and elegant at regular. Headings in Extra (800) and Bold (700); tactical use at 600 for seat names. Avoid mixing too many weights.
- **Body · [General Sans](https://www.fontshare.com/fonts/general-sans)** (Fontshare — free)
  A workhorse humanist sans with personality. Weight 400 body, 500 labels, 600 strong emphasis. Distinctive without shouting.
- **Numeric · [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)** @ 500 (shared with Le Salon — the one mono that works everywhere).

### Palette
```css
/* Obsidian Club — near-black, warm bone text, single acid accent */
--obsidian:       #0b0d10;  /* base — near-black with a hint of blue */
--onyx:           #16191e;  /* elevated surfaces (panels, chat rail) */
--granite:        #232831;  /* cards, highest elevation */
--bone:           #ebe6dc;  /* primary text — warm off-white, never pure white */
--bone-soft:      #c9c2b3;  /* secondary */
--fog:            #6e6a62;  /* muted, captions */
--chartreuse:     #c5ff4a;  /* THE accent — current turn, primary action, score wins */
--chartreuse-dim: #8bb434;  /* hover / ambient */
--ember:          #ff6b3d;  /* discard / warning / destructive */
--felt:           #05231f;  /* table felt — deepest emerald-black */
--felt-light:     #0c3b33;  /* felt nap highlight */
--rim:            rgba(197, 255, 74, 0.12);  /* accent glow base */
```
The rule: **one** chartreuse surface on screen at a time. It marks "whose turn" or "primary action," never both. This is what makes the whole system feel disciplined instead of gamer.

### Motion language
- **Easing:** `cubic-bezier(0.3, 0, 0, 1)` — sharp, confident deceleration. The curve says "I meant that."
- **Card draw:** 180ms slide + subtle opacity shift (0.6 → 1). Fast, done, next.
- **Card discard:** 220ms throw with a brief (60ms) motion-blur equivalent (`filter: blur(1.5px)` at mid-flight, released at land).
- **Turn transition:** the chartreuse underline sweeps across the active player's seat name over 280ms, left-to-right. When it passes, the previous player's seat dims its name by 20% in 200ms.
- **Hover on interactive cards:** `box-shadow: 0 12px 40px -12px var(--rim)` — a whisper of accent glow, only on hover.
- **Ambient:** a very slow vignette pulse at the screen edges, 4s cycle, ±3% opacity. Gives the room a heartbeat without ever being noticeable.
- **Celebration:** winner's seat frame draws in chartreuse one edge at a time (top → right → bottom → left), 600ms total. No confetti, no bounce. Confident.
- **Reduced-motion:** vignette pulse off, motion-blur off, underline becomes an instant colour change, edge-draw becomes a 120ms fade.

### Mood reference
A still from Michael Mann's *Heat* — but set in a card room. Lit by a single green banker's lamp plus one chartreuse neon sign reflected off the bar's mirrored back. Black leather booth, a bone-white shirt cuff at the edge of frame, cards held low and close. Silence loud enough to hear the cards being riffled.

### Strength / trade-off
- **Strength:** the most distinctive of the three on a small screenshot, looks premium/serious, the chartreuse accent is instantly legible as "active turn." Works gorgeously for Gin Rummy, Cribbage, Phase 10.
- **Trade-off:** family games like Go Fish or War may feel over-serious in this wrapper — counter that with a looser motion scale on those engines, or accept the consistent dark seriousness as a brand choice. Also: the accent colour is a commitment — changing it later would re-brand the whole app.

---

## Side-by-side summary

| | Le Salon | Bodega Riso | Obsidian Club |
|---|---|---|---|
| Mood | literary, calm | social, tactile | cinematic, confident |
| Base | warm paper | warm cream + grain | near-black |
| Accent | ochre | tomato + mustard | acid chartreuse |
| Display | Fraunces | Bricolage Grotesque | Syne |
| Body | Commissioner | Gelasio | General Sans |
| Felt | muted forest | deep teal | deepest emerald-black |
| Motion mass | quiet, deliberate | plops + bounces | sharp + cinematic |
| Works best for | async thinking games | social/family games | high-stakes play |
| Most distinctive in | typography + negative space | colour + tactility | one-accent discipline |
| Risk | too reserved for loud games | performance of texture layers | over-serious for kids' games |

## Pick one

Reply with the name (or 1/2/3) and I'll begin Phase 3 — mobile-first implementation with that direction's tokens wired through Tailwind theme + CSS variables, the hand-layout fix, opponent-strip fix, modal portal fix, and the rest of the audit's BLOCK list.

---

*All three directions avoid Inter / Roboto / Arial. All fonts listed are free (Google Fonts or Fontshare). All palettes are defined as CSS variables so a future theme switch is a token swap, not a rewrite.*
