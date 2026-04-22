# Cribbage Board — Visual directions

Three directions for the inward-spiral board. Each has to **also survive theme-swap** (Le Salon / Bodega Riso / Obsidian Club) — the existing three-theme system means the board is a visual island that inherits substrate, accent, and typography from whichever theme is active. So the "direction" below is the *material language and detailing*, not a fixed palette; per-theme hex values are shown in the palette block for each.

Each sketch shows a **90° arc of one lane** with hole spacing, plus a peg and one group-of-five cue, at a scale that reads the same way the final board will.

---

## Direction A — "Heirloom" (chosen — see §4)

**Vibe.** A turned-and-inlaid walnut cribbage board that a grandparent gave you — warm hardwood slab, brass-bossed holes, engraved laurel at the finish. The spiral reads as a groove routed into a real object.

**Substrate.** Figured hardwood slab with a subtle grain film and an inner bezel hairline. On Le Salon the wood is walnut; on Obsidian it ebonises to near-black fumed oak with brass inlay glowing; on Riso it lightens to a warmer sycamore. Edge has a 1px brass pinstripe.

**Hole rendering.** Each hole is a 4px-radius well with a 1px dark inner shadow (drilled-into-wood look) plus a 1px brass rim-highlight on the upper-left quadrant. Empty holes read as punched wood; the two resting peg positions read as filled.

**Lane differentiation.** Each lane has an engraved inlay strip along its groove in a subtly different brass finish (warm brass / cool brass / rose brass). A single **glyph at the lane's start cluster** — ♠ / ♥ / ♦ — serves as the non-colour differentiator for accessibility. The lane's peg colour picks up the theme's accent spectrum (ochre / tomato / chartreuse), but the glyph and inlay tone carry identity too.

**Peg design.** Tiny turned-cylinder pegs, ~6px radius on desktop, drop-shadow under. **Front peg = current score**, solid metal with a mirror highlight. **Back peg = previous score**, matte and 75% opacity — the eye reads the difference as "distance scored since the last play." Trailing peg is the same colour family but softer.

**Typography.** Inherits the theme's display (Fraunces / Bricolage Grotesque / Syne). Milestone labels (start, 61, 91, 121) rendered in small-caps at 0.18em tracking. Score totals below board use the theme's mono (JetBrains / Space Mono) with tabular-nums.

**Palette (per theme):**
```css
/* Heirloom tokens consumed by the board */
--board-substrate:        var(--paper-deep);     /* wood slab base */
--board-substrate-deep:   var(--ink-soft);       /* routed groove */
--board-bezel:            var(--hairline);       /* brass pinstripe */
--board-hole:             var(--ink-soft);       /* drilled well */
--board-hole-rim:         var(--hairline);       /* brass rim */
--board-start:            var(--ochre-hi);       /* start cluster glow */
--board-finish:           var(--ochre);          /* laurel gold */
--board-milestone:        var(--burgundy);       /* 61 / 91 ticks */
--board-peg-trail:        0.55;                  /* back-peg opacity */
```
(All three themes have every variable defined; the board never sets raw hex.)

**Motion.** A score update animates the peg along the lane at **arc-length-constant speed**, 80ms per hole up to a cap of 600ms. A subtle dwell (60ms) at the landing hole before the `peg-move` sound fires. At milestones (every 5, the 61/91 ticks, and the 121 finish) the destination hole emits a one-shot 180ms halo. Reduced-motion path: snap + 140ms destination fade, no halo sweep.

**Sketch.**
```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Wood substrate (cropped) -->
  <rect x="0" y="0" width="200" height="200" fill="#e2d4b8"/>
  <!-- Groove -->
  <path d="M 20 100 A 80 80 0 0 1 100 20" fill="none" stroke="#3a3027" stroke-width="10" opacity="0.18"/>
  <!-- Brass inlay -->
  <path d="M 20 100 A 80 80 0 0 1 100 20" fill="none" stroke="#b57b2d" stroke-width="1" opacity="0.55"/>
  <!-- Holes, 9 of them, evenly arc-spaced; middle (group-of-5 mark) has larger rim -->
  <g fill="#3a3027">
    <circle cx="20"      cy="100"   r="3"/>
    <circle cx="23.3"    cy="81.3"  r="3"/>
    <circle cx="32.6"    cy="64.6"  r="3"/>
    <circle cx="47.0"    cy="50.8"  r="3"/>
    <circle cx="64.6"    cy="41.6"  r="3"/>  <!-- group-of-5: has brass rim -->
    <circle cx="81.3"    cy="37.0"  r="3"/>
    <circle cx="100"     cy="35"    r="3"/>
    <circle cx="118.7"   cy="37.0"  r="3" opacity="0"/>
    <circle cx="135.4"   cy="41.6"  r="3" opacity="0"/>
  </g>
  <!-- Group-of-5 rim highlight -->
  <circle cx="64.6" cy="41.6" r="4.6" fill="none" stroke="#c9b997" stroke-width="1"/>
  <!-- Peg at hole 3 (front) + trailing at hole 0 (back) -->
  <circle cx="47.0" cy="50.8" r="4.5" fill="#b57b2d" stroke="#1d1812" stroke-width="0.5"/>
  <circle cx="20"   cy="100"  r="4"   fill="#b57b2d" opacity="0.55"/>
  <!-- Start glyph -->
  <text x="15" y="120" font-family="Fraunces, serif" font-size="7" fill="#877457">♥</text>
</svg>
```

---

## Direction B — "Admiralty" (cartographic)

**Vibe.** A nautical chart etched on linen. The spiral reads as a contour line; milestones are compass rosettes; the finish is an X-marks-the-spot.

**Substrate.** Off-white linen (or paper) substrate with a faint cross-hatched grid at 50% opacity, darker at the corners (aged map). Hairline neatline border.

**Hole rendering.** Small filled ink rings (not wells) — 3px radius, 0.5px stroke at the theme's ink colour. Reads as a punched chart.

**Lane differentiation.** Three inks at **different weights**: iron-gall black (lane 1), deep vermillion (lane 2), prussian blue (lane 3). Each lane has a small **text tag** ("I" / "II" / "III" in roman numerals) at the start, giving a non-colour differentiator.

**Peg design.** Tiny brass push-pins with a visible shadow. Front peg has a gloss highlight. Back peg is a half-translucent ring (an old pin-hole in the paper).

**Typography.** Inherited theme display for Roman numerals and milestone labels. **Milestones get compass-rosette glyphs** (N/E/S/W tick marks) at 61 and 91, and an ornate X at 121.

**Palette (per theme):**
```css
--board-substrate:        var(--paper);
--board-substrate-deep:   var(--paper-deep);
--board-bezel:            var(--hairline);
--board-hole:             var(--ink);
--board-hole-rim:         transparent;
--board-start:            var(--ochre);
--board-finish:           var(--burgundy);
--board-milestone:        var(--ochre-hi);
```

**Motion.** The peg glides along the spiral, then at landing a quick compass-needle spin (180°) at the destination (120ms). At milestones a quill-stroke underline sweeps under the number. Reduced-motion: snap + 100ms ink-bleed fade.

**Sketch.**
```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="200" height="200" fill="#f4ead8"/>
  <!-- Cross-hatch (faint) -->
  <defs>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M 0 6 L 6 0" stroke="#1d1812" stroke-width="0.3" opacity="0.09"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="200" height="200" fill="url(#hatch)"/>
  <!-- Contour arc -->
  <path d="M 20 100 A 80 80 0 0 1 100 20" fill="none" stroke="#1d1812" stroke-width="0.6"/>
  <!-- Holes (ink rings) -->
  <g fill="none" stroke="#1d1812" stroke-width="0.8">
    <circle cx="20"    cy="100"   r="2.3"/>
    <circle cx="23.3"  cy="81.3"  r="2.3"/>
    <circle cx="32.6"  cy="64.6"  r="2.3"/>
    <circle cx="47.0"  cy="50.8"  r="2.3"/>
    <circle cx="64.6"  cy="41.6"  r="3"   stroke="#b57b2d" stroke-width="1"/>
    <circle cx="81.3"  cy="37.0"  r="2.3"/>
    <circle cx="100"   cy="35"    r="2.3"/>
  </g>
  <!-- Peg (brass pin) -->
  <circle cx="47.0" cy="50.8" r="4" fill="#b57b2d" stroke="#1d1812" stroke-width="0.8"/>
  <circle cx="47.0" cy="50.8" r="1.5" fill="#ebe6dc"/>
  <!-- Start tag -->
  <text x="11" y="118" font-family="Fraunces, serif" font-size="8" font-style="italic" fill="#1d1812">I</text>
</svg>
```

---

## Direction C — "Kiln" (midcentury ceramic)

**Vibe.** A matte-glazed ceramic tile. The spiral is impressed into wet clay; holes are glaze-pooled wells; the finish is a raised medallion.

**Substrate.** Matte earthenware with a fine speckle noise. Subtle uneven glaze gradient (darker in the corners, lighter at the centre).

**Hole rendering.** 4px wells with a shiny glaze-pool at the bottom-right (an inner circle with a radial gradient from accent → substrate). Very tactile.

**Lane differentiation.** Glaze colour per lane: **teal / amber / plum**. Each lane has a small **ceramic stamp** at the start — a simple geometric motif (triangle / circle / square). Colour + shape = redundant differentiator.

**Peg design.** Tiny enamelled cones, cast a soft gradient shadow. Front peg = gloss highlight + rim. Back peg = 50% opacity, same shape.

**Typography.** Theme display used in all-caps for labels with 0.2em tracking. Milestones get a small ceramic stamp in their glaze colour.

**Palette (per theme):**
```css
--board-substrate:        var(--paper-raised);
--board-substrate-deep:   var(--paper-deep);
--board-bezel:            var(--hairline);
--board-hole:             var(--ink-soft);
--board-hole-rim:         var(--ochre-hi);
--board-start:            var(--sage);
--board-finish:           var(--ochre);
--board-milestone:        var(--burgundy);
```

**Motion.** The peg is "dipped" — a small scale-up (1.0→1.08) while sliding along the lane, scale-back at landing. At milestones a soft pulse-and-release on the milestone stamp. Reduced-motion: snap + fade.

**Sketch.**
```svg
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glaze" cx="40%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#ebe6dc"/>
      <stop offset="100%" stop-color="#e2d4b8"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="200" height="200" fill="url(#glaze)"/>
  <!-- Impressed arc -->
  <path d="M 20 100 A 80 80 0 0 1 100 20" fill="none" stroke="#3a3027" stroke-width="3" opacity="0.14"/>
  <!-- Wells -->
  <g>
    <circle cx="20"    cy="100"   r="3.2" fill="#3a3027" opacity="0.7"/>
    <circle cx="23.3"  cy="81.3"  r="3.2" fill="#3a3027" opacity="0.7"/>
    <circle cx="32.6"  cy="64.6"  r="3.2" fill="#3a3027" opacity="0.7"/>
    <circle cx="47.0"  cy="50.8"  r="3.2" fill="#3a3027" opacity="0.7"/>
    <circle cx="64.6"  cy="41.6"  r="3.6" fill="#3a3027" opacity="0.85" stroke="#d29945" stroke-width="0.6"/>
    <circle cx="81.3"  cy="37.0"  r="3.2" fill="#3a3027" opacity="0.7"/>
    <circle cx="100"   cy="35"    r="3.2" fill="#3a3027" opacity="0.7"/>
  </g>
  <!-- Peg: cone -->
  <circle cx="47.0" cy="50.8" r="4.6" fill="#2d9ea3"/>
  <circle cx="46" cy="49.5" r="1.4" fill="#9cd3b6" opacity="0.7"/>
  <!-- Start stamp: triangle -->
  <polygon points="10,114 18,114 14,108" fill="#2d9ea3"/>
</svg>
```

---

## Side-by-side

| | Heirloom | Admiralty | Kiln |
|---|---|---|---|
| Reads as | handmade wood+brass artefact | vintage chart | ceramic tile |
| Primary detail | inlaid groove + rim highlight | ink rings on linen | glaze-pooled wells |
| Lane mark (non-colour) | suit glyph ♠♥♦ | roman numerals I/II/III | shape stamp △○□ |
| Peg | turned cylinder, gloss | brass push-pin | enamelled cone |
| Strength | most "cribbage" — nostalgia | distinctive, calm | tactile, photographs beautifully |
| Trade-off | very classic (could feel safe) | less recognisable to cribbage purists | glaze rendering cost on low-end mobiles |

---

## Pick — Heirloom

I'm picking **Heirloom** and proceeding to Phase 3. Reasons:

1. **Theme-neutral across all three existing themes.** The material cues (wood, brass, engraving) carry in Le Salon (walnut + brass = native), Obsidian (ebonised oak with brass glow reads as noir elegance), and Riso (lightens to sycamore + tomato accent). The other two lean harder into single-theme territory.
2. **Strongest "this is a cribbage board" signal** — players recognise the form instantly, and the app is built to host cribbage for people who already know and love the game.
3. **Mechanically cleanest** for the responsive brief: wood + brass + engraving renders fine at 375px with no filter-heavy passes; Kiln's radial-gradient wells and Admiralty's cross-hatch pattern both want more detail than a 375px board can carry.
4. **Most accessible of the three** — suit-glyph lane markers are high-contrast, shape-plus-colour redundant, and don't steal attention from the numerals.

If you want one of the other two instead, say the word and I'll swap — otherwise I'm implementing Heirloom now.
