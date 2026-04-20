# Claude's Cards — Responsive Spec

This spec accompanies `design-prototype/index.html`. Open the HTML file locally and resize the browser (or use device emulation) to see every rule in action.

---

## 1. Breakpoints

| Tier            | Min width | Target devices                        | Grid cols | Margin | Gutter |
| --------------- | --------- | ------------------------------------- | --------- | ------ | ------ |
| `mobile-360`    | 360       | Smallest phones                       | 4         | 16     | 16     |
| `mobile-390`    | 390       | Modern phones (iPhone 14/15/16)       | 4         | 16     | 16     |
| `tablet-768`   | 768       | iPad portrait                          | 8         | 24     | 24     |
| `tablet-820`   | 820       | iPad 10th gen portrait                 | 8         | 24     | 24     |
| `desktop-1024` | 1024      | iPad landscape / small laptops         | 12        | 32     | 32     |
| `desktop-1280` | 1280      | Standard desktop                       | 12        | 32     | 32     |
| `desktop-1440` | 1440      | Large desktop                          | 12        | 32     | 32     |
| `wide-1920`    | 1920      | TV / large monitors                    | 12        | 32     | 32     |

**Content width clamp:** 100% (mobile) → 720 (tablet) → 1040 (1024) → 1280 (1440) → 1440 (1920). Anything wider than 1440 gets letterboxed around a 1440 content column.

**No horizontal scroll rule:** The only permitted horizontal scroll containers are (a) the mobile opponent strip in the game table, and (b) code blocks / preformatted text. Everything else must wrap, clamp, stack, or truncate.

---

## 2. Spacing Tokens

Powers of 4 up to 24, then doubling. Use these — never ad-hoc pixel values.

```
--s-1   4px    hairline gap, icon-text
--s-2   8px    tight gap
--s-3   12px   default compact gap
--s-4   16px   default block spacing, mobile page margin
--s-5   20px
--s-6   24px   section breathing, tablet page margin
--s-8   32px   between siblings, desktop margin
--s-10  40px
--s-12  48px   top-of-section
--s-16  64px   major section rhythm
--s-20  80px
--s-24  96px   hero padding on desktop
```

Component rules derived from tokens:

- **Tap targets ≥ 44px** on mobile (inputs use `min-height: 48px`).
- **Form fields:** `padding: 12–14px`, `min-height: 48px`, `font-size: 16px` (stops iOS zoom).
- **Cards:** radius 16px, inner padding 20–24px depending on density.
- **Buttons:** pill radius, 12/20 padding at default size, 8/14 at compact.

---

## 3. Typography

Display: **Fraunces** (600/700). Body: **Manrope** (400/500/600/700). Mono: **JetBrains Mono**.

### Type ramp

| Token | Mobile (360–767)      | Tablet (768–1023)      | Desktop (≥1024)        | Usage                      |
| ----- | --------------------- | ---------------------- | ---------------------- | -------------------------- |
| H1    | 32 / 40 · -0.02em     | 40 / 48                | 48 / 56                | Hero only                  |
| H2    | 28 / 36               | 32 / 40                | 36 / 44                | Section heads              |
| H3    | 24 / 32               | 26 / 34                | 28 / 36                | Card titles                |
| H4    | 20 / 28               | 22 / 30                | 22 / 30                | Subsection                 |
| H5    | 18 / 26               | 18 / 26                | 18 / 26                | Meld / meta headings       |
| H6    | 16 / 22               | 16 / 22                | 16 / 22                | Form field labels (caps)   |
| Body  | 16 / 24               | 16 / 24                | 16 / 24                | Default paragraph          |
| Small | 14 / 20               | 14 / 20                | 14 / 20                | Secondary text             |
| Caption | 13 / 18             | 13 / 18                | 13 / 18                | Meta, badges, eyebrows     |

Headings use `letter-spacing: -0.01em` (H1: -0.02em). All caps labels use `letter-spacing: 0.08–0.14em`.

---

## 4. Grid System

A standard 4 / 8 / 12-column grid with consistent gutters. The prototype uses `grid-template-columns: repeat(var(--grid-cols), minmax(0, 1fr))` so any layout can opt into the grid by adding `.grid` and `span` utilities (not exhaustively shown).

| Viewport  | Columns | Gutter | Margin | Max content width |
| --------- | ------- | ------ | ------ | ----------------- |
| ≤ 767     | 4       | 16     | 16     | 100%              |
| 768–1023  | 8       | 24     | 24     | 720               |
| 1024–1439 | 12      | 32     | 32     | 1040              |
| 1440–1919 | 12      | 32     | 32     | 1280              |
| ≥ 1920    | 12      | 32     | 32     | 1440              |

---

## 5. Component Reflow Rules

### Header / primary nav

| Viewport | Behaviour                                                                |
| -------- | ------------------------------------------------------------------------ |
| ≤ 767    | Hamburger left, brand center, primary CTA right. Slide-in drawer on tap. |
| 768–1023 | Full inline nav (condensed — no icons). CTA right.                        |
| ≥ 1024   | Full inline nav + CTA. Sticky, 85% opacity + backdrop blur.              |

Drawer: slides from the **left** with scrim, `transform: translateX` on a 420ms cubic-bezier curve; closes on scrim click, ESC, or nav activation. Focus is trapped while open.

### Games grid (landing)

| Viewport | Columns |
| -------- | ------- |
| ≤ 767    | 2       |
| 768–1023 | 4       |
| ≥ 1024   | 5       |

Each card locks a 1:1.2 aspect-ratio feel via its internal padding and line-height.

### Room list (lobby)

| Viewport | Columns |
| -------- | ------- |
| ≤ 767    | 1       |
| 768–1279 | 2       |
| ≥ 1280   | 3       |

Toolbar stacks vertically on mobile (search full-width, then filter/create). From 768 up, toolbar becomes a single row with search expanding.

### Game table — the critical layout

Two distinct layouts, toggled at 1024px.

**Mobile + tablet (< 1024):**

```
┌────────────────────────┐
│ opponent strip (swipe) │
├────────────────────────┤
│                        │
│       felt card        │
│                        │
├────────────────────────┤
│      your hand         │
├────────────────────────┤
│      action bar        │
└────────────────────────┘
```

- Opponents are a horizontally-scrollable strip at the top, snap-aligned. Active player gets a cyan glow.
- Felt is a fluid card with `aspect-ratio: 16/10`; its content is a centered prompt (meld preview, turn message). No absolute card positioning — everything is flowed.
- Hand is a flex-wrap row; cards use `width: clamp(40px, 10.5vw, 72px)` so they shrink on 360 and grow toward 72px on tablets.
- Action bar is sticky to the bottom with `position: sticky; bottom: safe-area-inset-bottom + 8px`, pill-shaped.
- Chat is a bottom sheet opened by a floating action button. The sheet slides up to 60vh, has a drag handle, and respects safe-area padding.

**Desktop (≥ 1024):**

```
┌─────────────────────────────┬─────────┐
│                             │         │
│         felt + radial       │  chat   │
│         seats (abs-pos      │ (docked)│
│         appear here only)   │         │
│                             │         │
├─────────────────────────────┴─────────┤
│              action bar               │
└───────────────────────────────────────┘
```

- Felt gets 1fr of the horizontal space, chat takes 320px. Radial seats re-appear with `position: absolute` on the felt's edges (top-center, left, right).
- Mobile opponent strip disappears.
- Chat FAB + bottom sheet disappear — the chat panel is just docked.

**Key implementation contract:** none of the desktop-only absolute positions render below 1024, so no hidden overflow can push the viewport.

### Leaderboard

| Viewport | Layout            |
| -------- | ----------------- |
| ≤ 767    | Card list         |
| ≥ 768    | HTML `<table>`    |

Columns on tablet+: `# · Player · Wins · Games · Score`. Rank 1/2/3 use gold/silver/bronze gradient chips. No horizontal scroll — table is allowed because the column count at this width fits.

### Forms (settings, create-room)

| Viewport | Field grouping                              |
| -------- | ------------------------------------------- |
| ≤ 767    | One column. All fields stacked.             |
| ≥ 768    | Paired fields use `grid-template-columns: 1fr 1fr`. |

Field guarantees:
- `min-height: 48px` on inputs/selects.
- `font-size: 16px` so iOS Safari never zooms on focus.
- Labels always visible above the field (no placeholder-as-label).
- Error messages go below the field in danger red, 13px.
- Submit + cancel buttons stack vertically on mobile (`btn-block`), go inline on tablet+.

### Modals

- `max-width: min(520px, calc(100vw - 32px))` so there's always ≥16px gutter on the narrowest device.
- On iOS Safari, dialog respects `safe-area-inset-bottom`.
- Open with `transform: translateY(16px) → 0` + opacity fade, 260ms.
- Close on scrim click, ESC, or explicit close button.

### Images / media

- Every image has `max-width: 100%; height: auto;` as a baseline.
- Aspect ratios are declared on the container via `aspect-ratio`, never on the image.
- Covers (e.g., card faces filling a seat): `object-fit: cover; object-position: center`.
- Icons: SVG with `viewBox` and no fixed pixel `width`/`height` on the element (sized via CSS `width` in em or px tokens).

---

## 6. Accessibility

- **Color contrast:** body text on `#0a0f1e` is `#f1f5f9` → AAA. Muted text `#94a3b8` on raised surface → AA. Brand brass `#c8a96a` only used for decorative accents and large text, never for body.
- **Focus states:** `outline: 2px solid var(--color-secondary); outline-offset: 2px` on every interactive element via `:focus-visible`.
- **Tap targets:** ≥ 44 × 44 px. Icon-only buttons (hamburger, chat FAB, card buttons) use 44px+ wrappers even when the glyph is smaller.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables animations to `.01ms`.
- **Skip link:** a `.sr-only` skip-to-main-content link should be added when porting to React (not in prototype).
- **Keyboard:** drawer + chat sheet close on ESC; nav is keyboard navigable; focus trap planned for modals (not in prototype).

---

## 7. Interaction notes

- **Hover:** buttons lighten 6%, cards lift 2px. Never rely on hover alone — all hoverable affordances are also visible at rest.
- **Active:** buttons shift 1px down to give press feedback.
- **Drawer open:** 420ms ease-out slide + scrim fade. Body scroll locked while open.
- **Chat sheet:** 420ms ease-out from `translateY(110%)`. Handle + drag to dismiss (prototype: handle visible, drag not wired).
- **Turn pulse:** a 2.2s infinite cyan glow on the active seat / opponent — on mobile it's a subtle border flash to avoid GPU churn.
- **Card draw animation:** 260ms scale-in. Disabled below 768px so 10+ cards dealing at once don't jank.

---

## 8. Reflow checklist (self-test)

For each page, at each breakpoint:

- [ ] No horizontal scroll anywhere except intentional scroll containers.
- [ ] All tap targets ≥ 44px.
- [ ] Header remains usable (brand visible, primary action reachable).
- [ ] Headings do not exceed 2 lines on hero / 3 lines elsewhere.
- [ ] Inputs at 16px+ font-size so iOS doesn't zoom.
- [ ] Modals never touch screen edges (≥ 16px gutter).
- [ ] Cards / rooms wrap cleanly; no fixed pixel widths leaking in.
- [ ] Game table's felt stays on screen; hand fits one or two lines.
- [ ] Leaderboard is either card-list (mobile) or table (tablet+), never cramped.

---
