# Phase 3 — Web Interface Guidelines Audit

**Date:** 2026-04-21
**Scope:** the 17 files touched in the Le Salon refactor (tokens, globals, Tailwind config, index.html, card/table/chat/lobby components).
**Method:** Vercel Web Interface Guidelines (fetched from `vercel-labs/web-interface-guidelines/command.md`), cross-checked against the Le Salon brief in `design/directions.md`.
**Severity:**

| Tag | Meaning |
|---|---|
| **BLOCKER** | Violates WIG accessibility/semantic/motion rules in a way that breaks keyboard, a11y, or causes CLS/perf regressions. Must be fixed before merge. |
| **SHOULD-FIX** | Clear guideline violation, ships a visible quality regression or inconsistency with the Le Salon direction, but does not fully break the feature. |
| **NICE-TO-HAVE** | Polish or consistency item. |

Findings below are limited to issues present in **current** Phase 3 code. Baseline-audit items already resolved (mobile hand wrap, opponent-strip overlap, modal portal, breakpoints, tokens, `prefers-reduced-motion`, Enter+Space activate) are not repeated.

---

## 1. Accessibility — semantic HTML / ARIA

- **BLOCKER**  `apps/frontend/src/components/cards/CardComponent.tsx:82-85` — `<button>` already carries an implicit `role="button"`; the explicit `role="button"` on line 84 is redundant and violates WIG "Use semantic HTML before ARIA." Remove.
- **BLOCKER**  `apps/frontend/src/pages/LobbyPage.tsx:60-63` — `if (!isAuthenticated) { navigate('/', …); return null; }` called during render (not in `useEffect`) triggers a React warning and violates WIG hydration rules (side effects during render). Move to an effect or a route guard.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:845` — `aria-label="Other players"` is the only handle for the opponent rail, but it's on a plain `<div>`. Use `<section>` or add `role="region"` so AT announces the landmark. Same file line 883 ends the container.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:340-347` — the bot-announcer `<div aria-live="polite" aria-atomic="true" className="sr-only">` is rendered inside a conditional branch that may unmount (`GameTable.tsx:349-356` early-returns while `gameState` loads), so the live region isn't in the DOM when the first announcement could fire. Render the announcer outside the null-state guard.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:65-71` — `role="dialog"` + `aria-modal="true"` but there is no focus-trap and no `initialFocus` sent to the Ack button. WIG: modal focus must be trapped and returned to the trigger on close.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:72-75` — backdrop div with no `onClick` to dismiss and no `Esc` handler; the modal traps the user until they find the Ack button. Add `Esc` + backdrop-click.
- **SHOULD-FIX**  `apps/frontend/src/components/lobby/LobbyPage.tsx:81-131` — no skip-link to `<main>`; WIG: "include skip link for main content." The `<main>` on line 112 also lacks an `id` target.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:1131-1198` — the bottom "dock" wraps ActionBar + HandComponent + identity pill + Rank/Suit buttons in a plain `<div>` with no landmark; screen readers get no way to jump into "your controls." Wrap in `<section aria-label="Your controls">` or similar.
- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:265` — `bg-rose-600/90 text-white` — because `white` is remapped to `ink` (near-black) in `tailwind.config.js:65`, `text-white` on a burgundy background renders near-black-on-dark-red. Contrast drops below WCAG AA. Use `text-paper` for light foreground on burgundy instead.
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/Phase10Objective.tsx:16-44` — the objective pill has a computed `aria-label` on the outer container (line 27) but the inner `<span>`s repeat the same text to the screen-reader (Phase label + desc + "✓ laid down"). Prefer `aria-hidden="true"` on the duplicated inner text nodes.

## 2. Focus states

- **BLOCKER**  `apps/frontend/src/components/cards/PileComponent.tsx:49` — `focus:outline-none focus:ring-2 focus:ring-indigo-400`. Uses `focus` not `focus-visible`, so the ring lights up on every click, not just keyboard nav. WIG anti-pattern. Change to `focus-visible:ring-2 focus-visible:ring-ochre-hi`.
- **BLOCKER**  `apps/frontend/src/components/cards/PileComponent.tsx:94` — same issue on the discard pile (`focus:outline-none focus:ring-2 focus:ring-indigo-400`). Indigo is remapped to ochre by config so colour is OK, but the trigger (`focus` vs `focus-visible`) is wrong.
- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:159,165,207,213` — Send button and input use `focus-visible:ring-2` but `focus:outline-none` without the `-visible` suffix isn't paired; some browsers then strip the outline even for keyboard focus. Use `focus-visible:outline-none` or rely on the global `:focus-visible` rule in `globals.css:53`.
- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:161-167` — Send `<button>` has no `focus-visible` ring at all (desktop path line 209-215 is identical). Add `focus-visible:ring-2 focus-visible:ring-ochre-hi`.
- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:102-122` — mobile Chat toggle button has `focus-visible:ring-2 focus-visible:ring-ochre-hi` but no `ring-offset-*`, so on the paper-raised background the ring blends with the border. Add `focus-visible:ring-offset-2 focus-visible:ring-offset-paper`.

## 3. Motion

- **BLOCKER**  `apps/frontend/src/components/table/ActionBar.tsx:249` — `transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]`. WIG anti-pattern: "Never `transition: all` — list properties explicitly." Replace with `transition-[transform,box-shadow,background-color,border-color,color]`.
- **BLOCKER**  `apps/frontend/src/components/table/Phase10HandScore.tsx:191` — `transition-all duration-150` on the primary Ack button. Same rule. Replace with an explicit list (transform + box-shadow + filter is what the hover uses).
- **SHOULD-FIX**  `apps/frontend/src/components/cards/PileComponent.tsx:48,94` — `transition-colors` alone; the hover on the draw pile changes `border-color` (fine) but on the discard pile `isDropTarget` also swaps `ring-2 ring-green-400/50` which isn't animated by `transition-colors`. Either list `transition-[border-color,box-shadow]` or drop the ring on state change.
- **SHOULD-FIX**  `apps/frontend/src/styles/globals.css:21` — `scroll-behavior: smooth` is set globally; `@media (prefers-reduced-motion: reduce)` on line 95 sets `scroll-behavior: auto !important` — good — but the reduced-motion block (lines 88-97) zeroes *every* transition to 1ms. The Le Salon brief calls for reduced-motion to *compress* durations to ~120ms, not kill motion entirely. 1ms reads as "broken," not "quieter." Consider a middle path: 120ms + no rotations, as the brief specifies.
- **SHOULD-FIX**  `apps/frontend/src/components/cards/CardComponent.tsx:98` — `transition-[transform,box-shadow,border-color] duration-[180ms]` is correct, but the `hover:-translate-y-[4px]` on line 102 has no `transform-origin` set; on a wrapping flex hand card, origin drifts. Add `origin-bottom` or ensure the parent reserves space above.
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/GameTable.tsx:738-749` — `animate-turn-pulse` on the turn banner runs infinitely. WIG "Animations interruptible — respond to user input mid-animation." No pause on hover/focus. Consider pausing on `:hover` so the user can read the banner calmly.
- **NICE-TO-HAVE**  `apps/frontend/src/styles/tokens.css:62-69` — shadows define `--shadow-lift` but `tailwind.config.js:137` defines a separate `shadow.lift` with a different ring colour/opacity. They diverge; pick one source.

## 4. Forms

- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:151-160` / `198-207` — chat `<input type="text">` has no `autocomplete`, no `name`, and no `spellCheck={false}` (it isn't an email/code, so spellcheck is fine, but `autocomplete="off"` is WIG-recommended on non-auth free-text fields to avoid password-manager triggers). Add `autoComplete="off"` and `name="chatMessage"`.
- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:151-160` / `198-207` — no `enterKeyHint="send"` — mobile keyboards won't show a Send affordance on the return key. Add `enterKeyHint="send"`.
- **SHOULD-FIX**  `apps/frontend/src/components/lobby/FilterSidebar.tsx:49-59,64-73` — native `<select>` elements lack explicit `background-color`/`color`. WIG dark-mode rule applies to any themed surface: Windows dark-mode will render the native select with the OS's own palette, not Le Salon's paper/ink. Add inline style or `accent-color` equivalent so the open dropdown matches.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:91-106` — destructive "End game" confirmation uses `window.confirm(...)`. WIG "Destructive actions need confirmation modal or undo window — never immediate." `window.confirm` is a native blocking dialog, not themeable, and cannot satisfy reduced-motion or i18n. Replace with a proper modal (sibling of Phase10HandScore pattern) or a toast-based undo window.
- **NICE-TO-HAVE**  `apps/frontend/src/components/chat/TableChat.tsx:156,204` — placeholder text comes from `en.chat.placeholder`. WIG: placeholders end with `…` and show an example pattern. Verify the i18n string ends with `…` and reads like `"Type to chat…"`.

## 5. Touch & interaction

- **BLOCKER**  None — global `touch-action` is absent but cards & buttons don't have zoom-delay issues at the Tailwind defaults; however see below.
- **SHOULD-FIX**  `apps/frontend/src/styles/globals.css` — no global `touch-action: manipulation` declared on interactive roots, and no `-webkit-tap-highlight-color` reset. WIG baseline. Add:
  ```css
  button, a, [role="button"] { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  ```
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:65-83` — modal container does not set `overscroll-behavior: contain` on the scrollable body (`max-h-[90vh] overflow-y-auto` on line 82). Scroll-chaining leaks to the underlying table. Add `overscroll-contain`.
- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:125-149` — mobile bottom-sheet (line 127) with `overflow-y-auto` on line 131; same issue, add `overscroll-contain`.
- **SHOULD-FIX**  `apps/frontend/src/components/cards/HandComponent.tsx:182-192` — hand-strip is `overflow-x-auto overflow-y-visible` with `snap-x snap-mandatory`. Missing `overscroll-behavior-x: contain` means a horizontal flick at the edge of the strip scrolls the page. Add `overscroll-x-contain`.

## 6. Safe-area / layout / CLS

- **BLOCKER**  `apps/frontend/src/components/cards/PileComponent.tsx:53-67,98-107` — `<img>` tags lack explicit `width`/`height` attributes. CLS hit when artwork loads late. Add `width={64} height={96}` (or matching the `w-16 h-24` parent).
- **BLOCKER**  `apps/frontend/src/components/table/Phase10Objective.tsx:52-61` — `<img src={phasesChartUrl}>` lacks `width`/`height` and `loading` — and it's inside a container that sets `width: 560, height: 420` via style. Add explicit attributes; also add `loading="lazy"` since the chart is opt-in (below-fold).
- **BLOCKER**  `apps/frontend/src/components/cards/CardComponent.tsx:121-131` — `<img>` inside CardComponent has no `width`/`height`, relies on `style.width/height: '100%'`. With 10-15 cards in a hand, reflows accumulate as images decode. Add explicit dimensions or use CSS `aspect-ratio` on the wrapper.
- **SHOULD-FIX**  `apps/frontend/index.html:4-5` — viewport meta is OK (`initial-scale=1.0`) and not zoom-locked, but no `viewport-fit=cover`, so `env(safe-area-inset-*)` won't work on iOS notched devices. Add `viewport-fit=cover`.
- **SHOULD-FIX**  `apps/frontend/index.html` — no `<meta name="theme-color">`. Le Salon paper is warm; add `<meta name="theme-color" content="#f4ead8">` so the mobile browser chrome matches the parchment base.
- **SHOULD-FIX**  `apps/frontend/src/styles/globals.css` — no `color-scheme` declared on `<html>` (needed for scrollbar/native-input theming). Le Salon is a light theme; add `color-scheme: light` to the `:root` block in `tokens.css` or as an `html { color-scheme: light; }` in `globals.css`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:723` — `<div className="relative flex flex-col lg:flex-row min-h-screen bg-paper overflow-hidden font-sans text-ink">` — `overflow-hidden` on the root clips any overlay positioned at the edges (the Phase10HandScore modal now portals to `document.body` so it's fine, but the `WinCelebration` and `GinRummyShowdown` do not — `GameTable.tsx:1074, 1112`). Drop the `overflow-hidden` or ensure every overlay portals.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:890-897` — the main stage uses `lg:absolute lg:inset-0 … pointer-events-none` with an inner `pointer-events-auto` felt; any empty area outside the felt eats pointer events silently (the `pointer-events-none` is correct, but the `-none` is declared on the flex container that ALSO contains the felt — relies on the inner override). Safer to move `pointer-events-none` to a dedicated spacer layer. Currently works, but a refactor will easily re-introduce the "can't click X" bug.
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/Phase10Objective.tsx:48-51` — `style={{ width: 560, height: 420 }}` is fixed pixel — on 375px viewport the chart overflows horizontally. Constrain with `max-w-full` and scale via `aspect-ratio`.

## 7. Images

- **BLOCKER**  `apps/frontend/src/components/cards/PileComponent.tsx:53-67` — already noted in §6 for CLS; repeated because decorative context applies: the draw-pile image is functionally decorative (the button's `aria-label` says "Draw pile — N cards remaining"). Use `alt=""` to avoid double-reading, not `alt="Draw pile"`.
- **SHOULD-FIX**  `apps/frontend/src/components/cards/PileComponent.tsx:98-107` — same: `alt="Top of pile"` duplicates the button's aria-label. Use `alt=""`.
- **NICE-TO-HAVE**  `apps/frontend/index.html:9-13` — data-URI favicon is fine but still uses the *legacy* `#0a0f1e` night background and `#c8a96a` brass — visually at odds with the Le Salon paper palette. Regenerate with `#f4ead8` base and `#b57b2d` glyph.

## 8. Performance

- **SHOULD-FIX**  `apps/frontend/index.html:14-22` — font preconnect is in place, but no `<link rel="preload" as="font">` for the critical above-the-fold faces (Fraunces variable + Commissioner 400). WIG: "Critical fonts: preload with `font-display: swap`." Add preloads for the woff2 URLs that Google Fonts returns, or self-host and preload.
- **SHOULD-FIX**  `apps/frontend/src/components/cards/HandComponent.tsx:178-209` — no virtualization on the hand list. Phase 10 hands top out at 10, but Canasta can reach 20+ cards plus melds; the strip re-renders every card on every hand-state change. Add `React.memo` on `SortableCard` keyed by `card.id + selected + justDrawn` to cut re-renders. (Lists under 50 items don't require `virtua`, but memoization is cheap and the drag handlers fire often.)
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/TableFelt.tsx:14-47` — the felt uses two absolutely-positioned decorative layers (cross-hatch + inner hairline) plus a radial gradient background. Combined cost is fine on desktop but `mix-blend-mode: overlay` (line 33) forces a new compositor layer. Consider `will-change: auto` or drop the blend mode on mobile.
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/GameTable.tsx:184-206` — global `document.addEventListener('keydown', …)` listens on every render of the table for the 'd'/'D' discard shortcut. Works, but a11y-wise the shortcut isn't announced anywhere; consider `<kbd>` hints in the Rules panel.

## 9. Navigation & state

- **BLOCKER**  `apps/frontend/src/pages/LobbyPage.tsx:60-63` — see §1. `navigate('/', { replace: true })` is called during render if unauthenticated. React will warn, and on re-auth races the lobby component briefly mounts with stale state. Move to a route guard or a `useEffect`.
- **SHOULD-FIX**  `apps/frontend/src/components/lobby/FilterSidebar.tsx:22-37` — filter state goes into Zustand (`useLobbyStore`) but not the URL. WIG: "URL reflects state — filters, tabs, pagination in query params." A shared lobby link should preserve `?game=phase10&async=true`. Sync via `nuqs` or manual `useSearchParams`.
- **SHOULD-FIX**  `apps/frontend/src/components/lobby/GameBrowser.tsx:16-18` — `selectedGame` modal state is local `useState`. Same URL-sync rule: the room-browser modal doesn't deep-link. `?browse=phase10` would let users share a link directly to a game's room list.
- **NICE-TO-HAVE**  `apps/frontend/src/pages/LobbyPage.tsx:24,99-106` — `friendsOpen` is local state — URL-sync would let "view friends" be a shareable state, but low priority on a lobby.

## 10. Content handling — long strings, empty states

- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:498-502` — `` `Waiting for ${ginrummyShowdown.waitingOn.join(', ')}…` `` — with three+ waiting players the string overflows the action bar's `whitespace-nowrap` buttons on mobile. Add `truncate` on the parent `<span>` and `max-w-[60vw]`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:171-175` — `Waiting for {names joined}` has no `truncate`/`line-clamp` — with 4-player async games and long display names this overflows the disabled button (`w-full`), which then wraps into the `min-h-[48px]` and breaks the pill shape.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:1153` — `<span className="text-ink truncate max-w-[10rem]">{myPlayer.displayName}</span>` truncates, but the parent `<div>` around it (line 1152) is `inline-flex … flex-wrap justify-center` (see the outer container line 1151) and does not include `min-w-0`, so `truncate` has nothing to truncate against. Add `min-w-0` to the flex ancestor.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10Objective.tsx:30` — `text-ink-soft truncate` on the objective description works only if the parent has `min-w-0`. Line 26 wraps everything in `flex flex-row items-center gap-2`, no `min-w-0` → Phase 10's long objective strings ("One set of 5 + one run of 2" etc.) don't truncate, they push the pill wider than the viewport.

## 11. Hover & interactive states

- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:259-262` — `btnGhost` hover only changes border + text; no background-color change means the interactive affordance is subtle, especially on tablet where `:hover` on touch is sticky. Add a `hover:bg-paper-deep/40` or similar.
- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:270` — `btnDisabled` keeps `cursor-not-allowed` on a styled `<button disabled>`. Browsers suppress `cursor` on `:disabled` buttons; rule is effectively dead. Either drop `cursor-not-allowed` (WIG prefers honest native behaviour) or target the `disabled:cursor-not-allowed` variant.
- **NICE-TO-HAVE**  `apps/frontend/src/components/cards/CardComponent.tsx:101-102` — selected state sets `-translate-y-[10px]` but hover also translates `hover:-translate-y-[4px]`; the two are non-additive — a selected card hovered jumps back to 4px instead of going deeper. Use `group-hover` or condition the hover translate off `selected`.

## 12. Typography / content & copy

- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:87-96` — "Hand complete" / "Hand scored" use Title Case per WIG. `{winner.displayName} went out` should be Title Case (WIG Chicago rule) — "Went Out" — **or** keep sentence case consistently. Currently mixes both.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:177` — `"The next hand starts as soon as everyone's ready."` uses a straight apostrophe (`'`). WIG: curly quotes. Change to `everyone&rsquo;s`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:171-174` — `Waiting for {names.join(', ')}` — commas between 3+ names should join with "and" for the last: "Alice, Bob, and Carol." Also consider `Intl.ListFormat('en', { style: 'long', type: 'conjunction' })` — WIG locale rule "Use `Intl.*` not hardcoded formats."
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:94` — `went out` — hardcoded English string in JSX. Violates CLAUDE.md Rule 10 (i18n).
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:87,95,128,150,171,177,194` — same: "Hand complete", "Hand scored", "Winner", "pts", "Waiting for", "The next hand starts…", "Ready for next hand" are all hardcoded. Move to `en.json`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10Objective.tsx:42` — `Hide phases` / `Show all phases` hardcoded. Move to `en.json`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:787,796,1171,1179,845` — hardcoded: `Initial meld complete`, `Initial meld needs {n} pts`, `Sort hand by rank`, `Sort hand by suit`, `Other players`. Move to `en.json`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:94` — confirm text `"End and delete this game? All progress will be lost. This cannot be undone."` hardcoded. Move to `en.json` (and, per §4, move off `window.confirm`).
- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:331,346,367,404,440,495,501,547-556` — hardcoded English: "Your turn — tap a card to play", "OK — Count", "OK — Next Hand", "Waiting for {n} to count…", "Pass 3", "Declare suit:", "Continue", "Settling…", "Knock"/"Gin"/"Big Gin" and their aria labels. Move to `en.json`.
- **SHOULD-FIX**  `apps/frontend/src/components/lobby/GameBrowser.tsx:55-57` — `{count} game` / `{count} games` hardcoded; also should use `Intl.PluralRules`. Move to `en.json` with plural form.
- **SHOULD-FIX**  `apps/frontend/src/components/lobby/LobbyPage.tsx:105` — `<span className="sr-only">Friends</span>` hardcoded; wrap with i18n.
- **SHOULD-FIX**  `apps/frontend/src/components/chat/TableChat.tsx:116,128,176` — `"Hide chat" / "Chat"` (line 116), `aria-label="Chat"` (128, 176) hardcoded.
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/GameTable.tsx:93-95` — "All progress will be lost. This cannot be undone." — WIG copy rule: "Error messages include fix/next step, not just problem." Rephrase with a positive action ("Start a new game any time from the lobby").
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/Phase10Objective.tsx:42` — toggle label "Show all phases" / "Hide phases" — inconsistent verbs. WIG "Specific button labels." Pick one form: "Show phases" / "Hide phases", or "Expand chart" / "Collapse chart."
- **NICE-TO-HAVE**  `apps/frontend/src/styles/globals.css:25-34` — body `font-feature-settings: 'ss01', 'cv02'`. Commissioner's `ss01` is fine; verify `cv02` exists on the Google Fonts build (otherwise it's a silent no-op).
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/Phase10HandScore.tsx:89-96` — h2 heading uses `text-2xl sm:text-3xl` but no `text-balance` / `text-pretty`. The auto-generated "`{name} went out`" easily becomes a widow at longer names. Add `text-balance`.
- **NICE-TO-HAVE**  `apps/frontend/src/components/lobby/GameCard.tsx:34` — h3 "game.name" has `break-words hyphens-auto` — good — but no `text-balance`. Short two-word titles ("Gin Rummy", "Crazy Eights") would benefit.
- **NICE-TO-HAVE**  `apps/frontend/src/components/lobby/GameBrowser.tsx:52-54` — h2 "{en.lobby.gameBrowserTitle}" at `text-2xl sm:text-3xl` — add `text-balance` and `font-display` tracking tightness (already `font-display` but could use `tracking-tight`).

## 13. Locale / i18n

- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:1155-1156` — score rendering `<span className="font-mono text-ochre text-xs tabular-nums">{myPlayer.score ?? 0}</span>`. Works but bypasses `Intl.NumberFormat` — for scores that can cross 1,000 (Phase 10, Canasta) no separator shows. Use `new Intl.NumberFormat().format(score)`.
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:144,147` — `±0` / `+{delta}` / raw score render — same as above; use `Intl.NumberFormat` with `signDisplay: 'exceptZero'` to match the `±0` convention natively.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:733` — `roomId.slice(-6).toUpperCase()` is fine but should be wrapped `translate="no"` so browser auto-translation doesn't garble the room code.
- **NICE-TO-HAVE**  `apps/frontend/src/components/table/GameTable.tsx:1155` — player score — wrap the parent pill in `translate="no"` on the score itself (not the name) so translated UIs keep the numeric clean.

## 14. Hydration safety

- **BLOCKER**  `apps/frontend/src/components/chat/TableChat.tsx:151-160,199-207` — `<input type="text" value={inputValue} onChange={…}>` is controlled — OK — but has no `autoComplete` attribute, so browser autofill may hydrate a value server-side that differs client-side. WIG: "Inputs with `value` need `onChange` (or use `defaultValue` for uncontrolled)." Fine here since `onChange` exists; but see §4 on `autoComplete="off"` which also avoids a hydration-mismatch class of bug.
- **NICE-TO-HAVE**  No date/time rendering in the audited files, so no hydration-mismatch risk from `toLocaleString` server vs client.

## 15. Anti-patterns cross-check

| Anti-pattern | Status |
|---|---|
| `user-scalable=no` / `maximum-scale` | Clean (`index.html:5`). |
| `onPaste` + `preventDefault` | Not present. |
| `transition: all` | **2 violations** — `ActionBar.tsx:249`, `Phase10HandScore.tsx:191`. |
| `outline-none` without focus-visible replacement | **2 violations** — `PileComponent.tsx:49,94` use `focus:ring` not `focus-visible:ring`. |
| `<div>/<span>` with click handlers | Clean. |
| Images without dimensions | **3 files** — `CardComponent.tsx:121`, `PileComponent.tsx:53,98`, `Phase10Objective.tsx:52`. |
| Large arrays without virtualization | Marginal (hands ≤20). |
| Form inputs without labels | Clean (labels wrap selects, chat input uses `aria-label`). |
| Icon buttons without `aria-label` | Clean — chat toggle / friends toggle / end-game / settings all labelled. |
| Hardcoded date/number formats | `Intl.NumberFormat` not used for scores — see §13. |
| `autoFocus` without justification | None found. |

## 16. Le Salon direction — consistency drift

These are not WIG items but the brief explicitly promised them; code diverges.

- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:253-257` — `btnPrimary` uses `bg-gradient-to-b from-brass-bright to-brass text-night`. "`night`" in config now maps to `paper` (`tailwind.config.js:57-60`), so the primary-button label is rendered in **paper** on a **brass/ochre** gradient — low contrast (warm-on-warm) and contradicts the Le Salon "ochre accent with ink text" rule. Use `text-ink` explicitly. Verify WCAG contrast of ochre-hi→ochre gradient with ink text.
- **SHOULD-FIX**  `apps/frontend/src/components/table/ActionBar.tsx:260,261,265,264,270` — `btnGhost` / `btnDanger` / `btnDisabled` still reference `bg-night/60`, `text-parchment/…`, `bg-rose-600/90 text-white` — *all of which are remapped to paper/ink shades*. The result is semantically working but visually muddy (paper-on-paper ghosts, ink-on-burgundy danger), with no explicit contrast guarantees. Rewrite these three tokens against the Le Salon palette directly (e.g. `bg-paper-deep/60 text-ink-soft` for ghost).
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:73` — backdrop uses `bg-[rgb(29_24_18_/_0.55)]` as an arbitrary-value class. Works but bypasses the token system. Use `bg-ink/55` (ink is RGB-declared in tokens, so the `/alpha` modifier works).
- **SHOULD-FIX**  `apps/frontend/src/components/table/Phase10HandScore.tsx:79,99-156,184-195` — the modal still uses `bg-night-raised`, `border-brass/35`, `text-parchment`, `text-brass-bright`, `bg-emerald-400`, `bg-slate-500`, `text-rose-300/90`. Legacy class names remapped via `tailwind.config.js` — they render, but only because of the remap. Per the brief, the modal should use semantic tokens (`bg-paper-raised`, `border-hairline`, `text-ink`, `text-ochre`, etc.). Intent is obscured — next contributor can't tell what's intended.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:741-798` — chrome banners (turn banner, dealer banner, Canasta initial-meld chip) reference `bg-night-raised/70`, `border-brass/20`, `text-brand-secondary`, `text-parchment/70`, `text-brass-bright/80`, `text-emerald-300/90`, `border-brass/15`. All remapped, but semantic mismatch. Migrate to token names.
- **SHOULD-FIX**  `apps/frontend/src/components/table/GameTable.tsx:953-955` — Crazy Eights declared-suit badge uses `bg-parchment`, `border-brass/60`, `text-rose-500` / `text-night`. `parchment` remaps to `ink` (dark!) per `tailwind.config.js:52-56`, so `bg-parchment` here renders a **dark circle with dark-red spade/heart glyph** on a green felt — near-invisible. Replace with `bg-paper` and `text-burgundy`/`text-ink`.
- **SHOULD-FIX**  `apps/frontend/src/styles/tokens.css:51-53` vs `tailwind.config.js:128-132` — font-family is declared twice, slightly differently (`'system-ui'` vs `'system-ui'`, fallback ordering). Single source of truth.
- **NICE-TO-HAVE**  `apps/frontend/src/components/cards/PileComponent.tsx:47-50` — draw-pile still uses `bg-slate-700 border-slate-600 hover:border-indigo-400`. Remapped to paper shades, but intent obscured (see §16 pattern). Use `bg-paper-deep border-hairline hover:border-ochre` explicitly.
- **NICE-TO-HAVE**  `apps/frontend/src/components/cards/PileComponent.tsx:70,91,109` — `bg-slate-800/80 text-white` on the count badge, `text-slate-600`, `border-green-400 ring-2 ring-green-400/50`. All repoint via remap; the result is legible but the `text-white` here (line 70) renders as **ink** by the remap, on `bg-slate-800/80` which is now `bg-paper-raised/80` → readable coincidentally. Rewrite directly.
- **NICE-TO-HAVE**  `apps/frontend/src/components/cards/CardComponent.tsx:103` — `!faceUp ? 'bg-[#1f2530]' : 'bg-[#ffffff]'`. The literal `#1f2530` (dark slate) is the only remaining dark-theme hardcode for card backs. Consider a `--card-back` token so deck-back art (phase10 vs standard) can be themed.

---

## 17. Summary

| Category | BLOCKER | SHOULD-FIX | NICE-TO-HAVE | Total |
|---|---:|---:|---:|---:|
| 1. Accessibility / ARIA | 2 | 6 | 1 | 9 |
| 2. Focus states | 2 | 3 | 0 | 5 |
| 3. Motion | 2 | 3 | 2 | 7 |
| 4. Forms | 0 | 4 | 1 | 5 |
| 5. Touch & interaction | 0 | 4 | 0 | 4 |
| 6. Safe-area / layout / CLS | 3 | 4 | 1 | 8 |
| 7. Images | 1 | 1 | 1 | 3 |
| 8. Performance | 0 | 2 | 2 | 4 |
| 9. Navigation & state | 1 | 2 | 1 | 4 |
| 10. Content handling | 0 | 4 | 0 | 4 |
| 11. Hover & interactive states | 0 | 2 | 1 | 3 |
| 12. Typography & copy | 0 | 10 | 4 | 14 |
| 13. Locale / i18n | 0 | 3 | 1 | 4 |
| 14. Hydration safety | 1 | 0 | 1 | 2 |
| 16. Le Salon direction drift | 0 | 6 | 3 | 9 |
| **Total** | **12** | **54** | **19** | **85** |

### Top fixes for a Phase 3.1 sweep

1. Remove `transition-all` in `ActionBar.tsx:249` and `Phase10HandScore.tsx:191`.
2. Swap `focus:` → `focus-visible:` on `PileComponent.tsx:49,94` and eradicate `focus:ring-indigo-400` — use ochre tokens.
3. Add `width`/`height` to the four `<img>` tags in card/pile/Phase10Objective (CLS BLOCKER).
4. Replace `window.confirm` end-of-game dialog with a Le Salon-themed modal, per §4.
5. Move the hardcoded English strings in `ActionBar.tsx`, `Phase10HandScore.tsx`, `Phase10Objective.tsx`, `GameTable.tsx`, `TableChat.tsx` to `en.json` — at least 25 occurrences violate CLAUDE.md rule 10.
6. Fix the `text-white` remap fallout: `ActionBar.tsx:265` (ink-on-burgundy), `GameTable.tsx:953-955` (ink-on-parchment), `PileComponent.tsx:70` (ink-on-paper-raised). Each is a contrast regression caused by the remap strategy — worth a tokens-driven rewrite before more files pile on.
7. Route LobbyPage's unauth redirect through an effect, not render (`LobbyPage.tsx:60-63`).
8. Add global `touch-action: manipulation`, `color-scheme: light`, `<meta name="theme-color">`, and `viewport-fit=cover` — 4 small wins in `globals.css` / `index.html`.
