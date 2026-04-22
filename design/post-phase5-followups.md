# Post-Phase-5 follow-ups — implemented

Closes the outstanding items called out in `design/review.md`, my Phase 5 summary, and the cribbage board review.

## What shipped

### 1. `window.confirm` → Le Salon-themed modal
**New:** `src/components/shared/ConfirmDialog.tsx` — paper surface, burgundy destructive action, ochre cancel, portaled to `document.body`, Esc + backdrop-click cancel, focus-trap, reduced-motion-safe.
**Wired:** End-game flow in `GameTable.tsx:93-109, 1220-1228`. Split the old `handleEndGame` into `handleEndGameRequest` (opens the modal) + `handleEndGameConfirm` (runs the deletion). No more native browser confirm.

### 2. `useFocusTrap` hook
**New:** `src/hooks/useFocusTrap.ts` — capture-previous-focus, trap Tab inside container, restore focus on close. Handles Shift+Tab cycling. Standard WAI-ARIA dialog pattern.
**Wired:** Phase10HandScore (`Phase10HandScore.tsx:76`) + ConfirmDialog (internal).

### 3. `Intl.NumberFormat` + `Intl.PluralRules`
**New:** `src/utils/formatScore.ts` — `formatScore(n)` (locale thousands separator), `formatDelta(n)` (signed with `±0` for zero), `pluralise(n, {one, other})`.
**Wired:**
- `Phase10HandScore.tsx` score + delta rendering
- `GameTable.tsx` player-identity-pill score
- `GameBrowser.tsx` `pluralise(n, {one: "{count} game", other: "{count} games"})`

### 4. i18n sweep
Moved 20+ hardcoded English strings out of JSX into `en.json`:

| File | Strings moved |
|---|---|
| `Phase10HandScore.tsx` | `"Hand complete"`, `"Hand scored"`, `"Winner"`, `"pts"`, `"Waiting for …"`, `"the next deal…"`, `"The next hand starts…"`, `"Ready for next hand"`, `"… went out"` |
| `Phase10Objective.tsx` | `"Show all phases"`, `"Hide phases"` |
| `GameTable.tsx` | `"Initial meld complete"`, `"Initial meld needs {n} pts"`, `"Sort hand by rank"`, `"Sort hand by suit"`, `"Rank"`, `"Suit"`, `"Other players"`, end-game confirm title/body/actions |
| `TableChat.tsx` | `"Hide chat"`, `"Chat"` (both the visible label and the aria region) |
| `LobbyPage.tsx` | `"Friends"` (sr-only drawer toggle) |
| `GameBrowser.tsx` | `"N games"` plural |

New keys added under `table.*`, `lobby.*`, `chat.*` in `en.json`. All strings continue to render identically in English; the refactor just makes the localisation story viable.

### 5. Win announcement in live region
Already done in Phase 5 but worth noting — hitting 121 now announces via `en.table.cribbageWinAnnouncement`.

## Verification

- **`npm run typecheck`** → clean
- **`npx vitest run`** → **209/209 pass across 23 test files** (including 11 cribbage board + 6 hand + 6 bot-seat + 5 reports-queue + 6 connection-banner tests)
- **Visual** → `design/board-after/lobby-with-count.png` shows the new "15 games" plural counter

## Not touched (deliberate)

From `board-review.md` NICE-TO-HAVE:
- **S4/S5/S18** cribbage perf polish (filter cost + feTurbulence + setState-per-RAF) — not visible at 2-3 pegs on real hardware
- **S21** reduced-motion unit test — non-blocking
- **N1–N12** nice-to-haves

From `review.md` (main app):
- URL-sync of lobby filters (`?game=phase10&async=true`) — low-leverage; was flagged as SHOULD-FIX but nobody shares lobby URLs today
- `Intl.ListFormat` for waiting-on names — three+ waiters rarely happens in practice
- Per-phase "Show phases" / "Hide phases" → unified "Expand/Collapse chart" rename — pure verb-consistency nice-to-have
- ActionBar i18n sweep — that file has ~10 more hardcoded strings (knock/gin/big-gin labels, counting step prompts, etc.). ~40 minutes of mechanical work; deferring to a single-purpose follow-up PR so this one stays focused.

## Files touched

**New:**
- `src/components/shared/ConfirmDialog.tsx`
- `src/hooks/useFocusTrap.ts`
- `src/utils/formatScore.ts`

**Edited:**
- `src/i18n/en.json` (22 new keys)
- `src/components/table/GameTable.tsx`
- `src/components/table/Phase10HandScore.tsx`
- `src/components/table/Phase10Objective.tsx`
- `src/components/chat/TableChat.tsx`
- `src/pages/LobbyPage.tsx`
- `src/components/lobby/GameBrowser.tsx`

Branch state still `master`, everything uncommitted.
