# Crazy Eights

Shedding-type card game for 2–7 players. First player to empty their
hand wins the round; opponents score penalty points for cards left
behind. Game runs to a configurable target score.

This directory contains two modules:

| File        | Purpose                                                           |
| ----------- | ----------------------------------------------------------------- |
| `core.ts`   | **Pure game logic.** No I/O, no platform types. Deterministic via seeded PRNG. Exposes `newGame`, `legalActions`, `applyAction`, `getPublicView`, `startNextRound`. |
| `engine.ts` | **Platform adapter.** Wraps `core` in the `IGameEngine` interface used by the socket service. Stores authoritative state under `publicData.core`. |

The pure module is self-contained. The adapter bridges between the
frontend's combined `play` action (play a card and optionally declare
a suit for 8s in one call) and the core's strict two-step sequence
(`play` then `declareSuit`).

---

## Rules summary

### Setup

- **2–5 players** → one standard 52-card deck, no jokers.
- **6–7 players** → two standard decks shuffled together (104 cards).
  Duplicate suit+rank cards remain distinguishable via per-deck id
  tags (`AS_d0` / `AS_d1` etc.).
- Deal **7 cards each** for 2-player; **5 each** for 3+ players.
- Flip one card to start the discard pile.
  - Under `starterEightRule: 'reshuffle'` (default): if the starter is
    an 8, return it to the stock, shuffle again, and flip a new one.
  - Under `starterEightRule: 'nominate'`: the first player must
    declare a suit before anything else.
- First player is chosen by `firstPlayerRule`: `'randomBySeed'`
  (default) or `'leftOfDealer'`.

### A turn

On your turn, play one card from your hand onto the discard pile, or
draw from the stock. A card is legal if it matches the **current suit**
(see `activeSuit` below), the **rank** of the top discard, **or** it is
an 8 (always wild).

Playing an 8 puts the engine in `awaitingSuitChoice` phase — the same
player must then **declare a suit** before anyone else acts. The
declared suit becomes the match requirement for the next player.

#### `activeSuit`

The engine tracks an explicit `activeSuit` rather than reading the top
card's suit. After every non-8 play, `activeSuit` equals the played
card's suit. After every 8 play, `activeSuit` equals the declared suit.

### Drawing

If you can't play (or choose not to, under `drawOne` / `drawThree`),
you draw from the stock. The `drawRule` controls how:

| Rule                    | Behaviour                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| `drawUntilPlayable` (default) | Draw one card at a time until a playable one appears; play it. |
| `drawOne`               | Draw exactly one; optional play.                                       |
| `drawThree`             | Draw up to 3, stopping when playable; optional play.                    |

When the stock empties mid-draw, the discard pile (minus the top card)
is reshuffled back into the stock. If both are empty, the player passes.

### Scoring

Penalty points for cards remaining in hand when the round ends:

| Rank      | Points |
| --------- | ------ |
| 8         | 50     |
| K / Q / J / 10 | 10 |
| A         | 1      |
| 2–7 / 9   | face value |

Two scoring modes via `scoringMode`:

- **`penaltyAccumulation`** (default): penalties accumulate across
  rounds. Game ends when anyone crosses `targetScore`. **Winner = lowest
  total.**
- **`winnerTakesPoints`**: the round winner scores the sum of all
  opponents' penalties. Game ends when anyone reaches `targetScore`.
  Winner = highest total.

### Blocked rounds

A round is **blocked** when:

1. The stock is empty.
2. The discard has only the top card (no reshuffle possible).
3. The current player has no playable card.

`consecutivePasses` counts passes in a row; when it equals the player
count, the round blocks. `blockedRoundRule` controls the outcome:

- `'penaltiesToEveryone'` (default) — everyone adds their own hand
  penalty to their total; no round winner.
- `'awardLowest'` — lowest-penalty player is declared round winner and
  takes zero penalty.

### Variant action cards

All off by default. Enable per-game via `config.actionCards`:

| Flag                | Effect                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `queensSkip`        | Playing a Q skips the next player.                                     |
| `aceReverse`        | Playing an A reverses direction. In 2p, the same player plays again.   |
| `twoDrawTwo`        | Playing a 2 forces the next player to draw 2 (cumulative, see below).  |
| `jackSkip`          | Playing a J skips the next player.                                     |
| `pickUpStacking`    | The next player's 2 stacks onto a pending 2-draw-2 instead of absorbing. |

#### Interaction with 8s (twoDrawTwo)

**An 8 does NOT cancel a pending 2-draw-2 stack.** While
`pendingDrawPenalty > 0`, the only legal plays are another 2 (when
`pickUpStacking` is enabled) or drawing the penalty. Playing an 8 in
this state throws "Must draw pending penalty".

---

## Two-step 8 flow

Playing an 8 is a **two-action sequence** in the core:

1. `{ kind: 'play', playerId, cardId }` — transitions phase to
   `'awaitingSuitChoice'`.
2. `{ kind: 'declareSuit', playerId, suit }` — same player picks the
   new active suit; phase returns to `'awaitingPlay'` and the turn
   passes to the next player.

Both entries always appear in `state.history`. The frontend's
`ActionBar` suit-picker sends a **single combined** `play` action with
`payload.suit`; the adapter (`engine.ts`) splits that into the two
core actions under the hood.

### 8 as the last card

Spec §12 (14): playing an 8 as the final card **still wins the round** —
no suit declaration is required because nobody plays after. The core
records an auto-synthesised `declareSuit` entry in history (with the 8's
own suit) so the action log remains parseable, but the round ends
immediately and there's no `awaitingSuitChoice` phase.

---

## API

```ts
import {
  newGame,
  applyAction,
  legalActions,
  getPublicView,
  startNextRound,
  DEFAULT_CONFIG,
  type GameState,
  type Action,
  type CrazyEightsConfig,
} from './core';

const state: GameState = newGame(['alice', 'bob', 'cara'], DEFAULT_CONFIG, 42);

// What can alice do right now?
const legal: Action[] = legalActions(state, 'alice');

// Apply an action.
const next: GameState = applyAction(state, legal[0]!);

// Once phase === 'roundOver' and the game isn't over, start the next round:
if (next.phase === 'roundOver' && next.gameWinnerId === null) {
  const fresh = startNextRound(next); // preserves cumulative scores
}

// Hide private info for a viewer:
const publicView = getPublicView(state, 'alice');
```

### `GameState` shape

```ts
{
  players: PlayerState[];          // id, hand, scoreTotal
  stock: Card[];
  discard: Card[];                 // discard[length-1] is top
  activeSuit: 'S'|'H'|'D'|'C';
  currentPlayerIndex: number;
  direction: 1 | -1;
  phase: 'awaitingPlay' | 'awaitingSuitChoice' | 'roundOver' | 'gameOver';
  pendingDrawPenalty: number;      // 2-draw-2 stack total
  consecutivePasses: number;       // blocked-round detection
  turnNumber: number;
  roundNumber: number;
  history: Action[];
  seed: number;
  config: CrazyEightsConfig;
  roundWinnerId: string | null;
  blocked: boolean;
  gameWinnerId: string | null;
  deckCount: 1 | 2;
}
```

---

## Testing

- **Unit tests** (`__tests__/crazyeights-core.test.ts`) cover every
  §12 edge case: matching-suit/rank, 8 + declare, starter = 8 under both
  rules, draw rules, stock exhaustion + reshuffle, blocked rounds (all
  passing in sequence), scoring, 2-deck setup uniqueness, twoDrawTwo
  stacking + 8 interaction, queensSkip in 2p, aceReverse in 2p,
  determinism, 7-player auto-switching to 2 decks.
- **Invariant tests**: card total conservation at every step (52 / 104),
  `activeSuit` reflects the played card's suit (or declared suit after an
  8), round termination bounded under `drawUntilPlayable`.
- **Snapshot tests**: seed=101 (2p) round, seed=202 (4p) round, and a
  full game-to-target are snapshotted so any regression in the deal or
  rule engine surfaces immediately.
- **Adapter tests** (`__tests__/crazyEightsEngine.test.ts`) exercise the
  `IGameEngine` surface: metadata, deal sizes per variant (including
  auto-selection of 2 decks), combined play+declareSuit folding,
  deterministic dealing from roomId hashing.

Run:

```bash
cd apps/socket-service
npx jest __tests__/crazyeights-core.test.ts
npx jest __tests__/crazyEightsEngine.test.ts
```

---

## Non-goals

- **Not Uno.** No Skip, Reverse, or Wild Draw Four cards — only the
  house-rule toggles listed above.
- **No "last card" announcement penalty** — that's Uno.
- **No AI beyond Level 1 strategy** (handled by
  `bots/strategies/crazyeights.strategy.ts`: play non-8 matches
  first, then 8s declaring the most-held suit, then draw).
