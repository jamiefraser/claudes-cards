# Gin Rummy

Strictly 2-player rummy variant. Each player draws and discards to build
melds while minimising **deadwood** (unmelded cards). End a round by
**knocking** (deadwood ≤ 10) or **going gin** (0 deadwood). First player
to the target total wins the game plus bonuses.

This directory contains two modules:

| File        | Purpose                                                             |
| ----------- | ------------------------------------------------------------------- |
| `core.ts`   | **Pure game logic.** No I/O, no platform types. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `getPublicView`, `computeOptimalMeldingPartition`, `startNextRound`. |
| `engine.ts` | **Platform adapter.** Wraps `core` in `IGameEngine`. Stores authoritative state under `publicData.core`, preserves the UI-contract fields (`turnPhase`, `showdown`, `discardTop`). Auto-resolves the `awaitingLayoff` phase so the existing UI sees a single showdown modal. |

---

## Rules summary

### Setup

- Standard 52-card deck, no jokers. **Ace is always LOW** (A-2-3 is a
  valid run; Q-K-A is **not**).
- Shuffle, deal **10 cards** to each player, flip one card face-up to
  start the discard pile, stock holds the rest (31 cards).

### First turn (critical)

Before any normal turn:

1. The **non-dealer** is offered the upcard first. They may **take it**
   (append to hand + draw into `awaitingKnockOrDiscard` phase so they
   must discard) or **pass**.
2. If non-dealer passes, the **dealer** is offered the same upcard.
3. If both pass, the non-dealer begins a normal turn by drawing from
   stock.

This replaces the standard draw-then-discard flow only on the very
first turn of a round.

### Turn

Each subsequent turn has three parts:

1. **Draw** — one card from stock OR from discard.
2. **(Optional) End the round** — see below.
3. **Discard** — exactly one card. You **cannot** discard the card you
   just took from the discard pile.

### Ending a round

After drawing, a player may:

- **Knock** (deadwood ≤ 10): announce, submit a `meldingPartition`,
  discard one card. Opponent enters the layoff phase.
- **Gin** (deadwood = 0): submit partition, discard one card. No layoff.
- **Big gin** (11 cards all melded, configurable): submit partition,
  no discard. Bigger bonus. No layoff.

### Layoff

When the knocker is *not* in gin, the opponent may extend the
knocker's melds with matching cards to reduce their own deadwood:

- **Set extension**: add a card of the same rank in a suit not already
  present (cap at 4 cards).
- **Run extension**: add a card of the same suit adjacent to either
  end (ace-low only — no K+A wrap).

Opponents **cannot** create new melds of their own during layoff.

### Undercut

After all layoffs, if the opponent's remaining deadwood ≤ knocker's
deadwood, the opponent has **undercut** the knocker. The opponent
scores `(knockerDw − opponentDw) + undercutBonus` (default 25) that
round.

### Stock exhaustion

If the stock falls to the `stockExhaustThreshold` (default 2 cards) and
no one has ended, the round is a **wash** — no score, redeal. Adapter
restarts the round from the next dealer.

---

## Scoring

### Deadwood point values

| Rank       | Points |
| ---------- | ------ |
| A          | 1      |
| 2–10       | face   |
| J, Q, K    | 10     |

### Round payouts

| Ending        | Winner                          | Points                                  |
| ------------- | ------------------------------- | --------------------------------------- |
| Regular knock | Knocker                         | `opponentDw − knockerDw`                |
| Gin           | Knocker                         | `opponentDw + ginBonus` (default 20)    |
| Big gin       | Knocker                         | `opponentDw + bigGinBonus` (default 31) |
| Undercut      | Opponent (not the knocker!)     | `(knockerDw − opponentDw) + undercutBonus` (default 25) |
| Wash          | No one                          | 0                                       |

### Game end + bonuses

The game ends when either player's cumulative score reaches
`targetScore` (default 100). Final totals add:

- **Game bonus** (default 100) to the winner.
- **Box bonus** (default 20) per round won, to each player.
- **Shutout**: if the loser finishes with 0, the winner's game bonus is
  **doubled** (`shutoutDoublesGameBonus: true` by default).

---

## Two-step knock-like actions

The core's strict phase machine requires knock/gin to be expressed as
**two actions**:

1. `{ kind: 'knock'|'gin', playerId, meldingPartition, discardCardId }`
2. (on knock) opponent's `layoffCard` × N, then `doneLayingOff`

Big gin is one action:

- `{ kind: 'bigGin', playerId, meldingPartition }`

The adapter collapses this for the UI: when the frontend sends `{ type:
'knock' }`, the adapter computes the optimal partition, picks the
discard (highest-value deadwood card if not provided), auto-resolves
the layoff phase (defender greedily lays off every legal card), and
packages the result into `publicData.showdown` for the existing
showdown modal.

### Submitted partition validation

Every meld in the submitted `meldingPartition` is validated:

- Sets: 3 or 4 cards of the same rank, distinct suits.
- Runs: 3+ consecutive cards of the same suit, ace-low only (no wrap).
- Every card must appear in exactly one meld or in deadwood.
- Union must equal the hand (after the declared discard for knock/gin).

Invalid partitions throw. Use `computeOptimalMeldingPartition(hand)`
to compute the minimum-deadwood grouping — the adapter always uses this
helper so the UI doesn't need its own validator.

---

## API

```ts
import {
  newGame,
  applyAction,
  legalActions,
  getPublicView,
  computeOptimalMeldingPartition,
  startNextRound,
  DEFAULT_CONFIG,
  type GameState,
  type Action,
  type MeldingPartition,
} from './core';

const state: GameState = newGame(['alice', 'bob'], DEFAULT_CONFIG, 42);

const legal = legalActions(state, 'alice');
const next = applyAction(state, legal[0]!);

// Optimal partition for a hand — used by the UI to auto-select the
// discard and by the knock validator to check the player's submission.
const part: MeldingPartition = computeOptimalMeldingPartition(alice.hand);

// Between rounds:
if (next.phase === 'roundOver' && !next.gameWinnerId) {
  const fresh = startNextRound(next); // preserves cumulative scores
}
```

### GameState shape

```ts
{
  players: [PlayerState, PlayerState];
  stock: Card[];
  discard: Card[];
  currentPlayerIndex: 0 | 1;
  phase: 'firstTurnOffer' | 'firstTurnOfferDealer' | 'awaitingDraw'
       | 'awaitingKnockOrDiscard' | 'awaitingLayoff' | 'roundOver' | 'gameOver';
  nonDealerId: string;
  dealerId: string;
  lastAction: Action | null;
  discardDrawnThisTurn: string | null;
  awaitingLayoff: { knockerId, knockerMelds, knockerDeadwood, laidOffCards } | null;
  roundNumber: number;
  history: Action[];
  roundResult: RoundResult | null;
  gameWinnerId: string | null;
  seed: number;
  config: GinRummyConfig;
}
```

### Config defaults

```ts
{
  targetScore: 100,
  undercutBonus: 25,
  ginBonus: 20,
  bigGinBonus: 31,
  gameBonus: 100,
  boxBonus: 20,
  shutoutDoublesGameBonus: true,
  allowBigGin: true,
  stockExhaustThreshold: 2,
  dealerIndex: 0,
}
```

---

## Testing

- **Unit tests** (`__tests__/ginrummy-core.test.ts`) cover every §12
  edge case: first-turn offer branches, knock thresholds (exactly 10,
  > 10 rejected), gin, big gin, layoff (set extension, run extension,
  illegal extension rejected, skipped on gin), undercut, stock
  exhaustion (wash), can't-discard-drawn-card, can't-knock-before-draw,
  ace-high-wrap rejection, duplicate-card rejection, gin-with-deadwood
  rejection, determinism.
- **Invariants**: card total = 52 at every step; optimal partition
  returns ≤ any other valid partition; phase machine runs without
  throwing.
- **Snapshots**: forced knock, forced gin, forced big gin, full
  game-to-target with bonuses.
- **Adapter tests** (`__tests__/ginrummyEngine.test.ts`) exercise the
  IGameEngine surface: metadata, deal shape, first-turn-offer phase
  mapping to `draw` actions, `turnPhase` publicData contract,
  deterministic roomId dealing, `computeDeadwood` helper.

Run:

```bash
cd apps/socket-service
npx jest __tests__/ginrummy-core.test.ts
npx jest __tests__/ginrummyEngine.test.ts
```

---

## Non-goals

- No 3+ player variants.
- No "Hollywood" three-parallel-games scoring.
- No advanced AI (basic bot in `bots/strategies/ginrummy.strategy.ts`
  draws from deck, knocks when deadwood ≤ 10, discards highest card).
- The adapter currently **auto-resolves layoff** to match the existing
  UI. Interactive layoff (opponent picks which cards to lay off) is
  fully supported by `core.ts`; it's only gated at the adapter
  boundary.
