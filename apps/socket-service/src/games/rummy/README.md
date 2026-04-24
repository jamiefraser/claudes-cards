# Rummy (Basic / Standard)

2–6 player foundational rummy. Draw, form melds (sets of same rank or
runs of consecutive same-suit cards), lay off to existing melds, and
empty your hand to go out. Opponents' remaining cards tally as penalty
points to the winner.

> This is **plain Rummy** — not Gin Rummy, not 500 Rummy, not Canasta.
> Each of those has its own engine (`ginrummy/`, `canasta/`).

This directory contains two modules:

| File        | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `getPublicView`, plus validation helpers (`isSet`, `isRun`, `isValidMeld`, `cardPoints`). |
| `engine.ts` | `IGameEngine` adapter. Translates frontend actions (`draw`, `meld`, `layoff`, `discard`, `ack-round`) to core `Action` shapes. Preserves legacy `publicData.melds` shape for the existing UI; re-exports `isValidMeld` for backwards compatibility. |

---

## Rules summary

### Deck

- 2–4 players: one standard 52-card deck.
- 5–6 players: two 52-card decks (104 cards). Auto-selected at `newGame`.
- Optional 0/2/4 wild jokers (default 0).

### Ranks

Low → high: `A 2 3 4 5 6 7 8 9 10 J Q K`.

- Ace is **low by default**. A-2-3 is a legal run; Q-K-A is not.
- Toggle `aceHighLow` to also accept Q-K-A (but **never** K-A-2 — no wrap).

### Deal

- 2 players: 10 cards each.
- 3–4 players: 7 cards each.
- 5–6 players: 6 cards each.

Top card of the remaining deck flips to start the discard; the rest is
the stock. Dealer rotates clockwise; player left of dealer plays first.

### Melds

- **Set**: 3 or 4 cards of the same rank, different suits (unless
  `allowDuplicateSuitSet`).
- **Run**: 3+ consecutive cards of the same suit. Ace low by default;
  `aceHighLow` also accepts high-ace runs.

Only one joker permitted per meld.

### A turn

1. **Draw** one card, from the top of the stock OR the top of the
   discard pile.
2. **Meld / lay off** any number of times (optional):
   - Lay down a new set or run from hand.
   - Extend an existing meld with a card from hand (your meld by
     default; any meld unless `ownMeldsOnly`).
3. **Discard** exactly one card onto the top of the discard pile.
   - Canonically, you cannot discard the card you just drew from the
     discard pile (disable with `allowSameDiscard`).

If your hand is empty after discarding, you've **gone out** — the round
ends.

### Stock depletion

When the stock runs empty, take the discard pile (except the top
card), shuffle, and make that the new stock. Disable with
`noReshuffle` — then the round ends with everyone tallying remaining
cards as penalty.

### Scoring

Remaining-hand card values:

| Card | Points |
| :--: | -----: |
| A    | 1 (or `aceScoreHigh` = 15 when `aceHighLow`) |
| 2–10 | face value |
| J, Q, K | 10 |
| Joker   | 15 |

Two scoring modes (`scoringMode`):

- **`winnerTakesAll`** (default): winner scores the sum of every
  opponent's remaining hand value; everyone else scores 0.
- **`perPlayer`**: each non-winner subtracts their remainder from
  their cumulative score; winner scores 0.

Optional **rummy bonus** — if the winner melds their entire hand in
one turn with no prior melds, their score is multiplied by
`rummyBonusMultiplier` (default 2).

### Game end

The game ends when any player reaches `targetScore` (default 100).
Highest cumulative score wins; ties share the rank.

---

## State model

```ts
{
  players: PlayerState[];          // id, seat, hand, hasMeldedThisRound, scoreTotal
  stock: Card[];
  discard: Card[];                 // discard[last] is the top
  melds: Meld[];                   // { id, kind, cards, ownerId, setRank?, runSuit? }
  currentPlayerIndex: number;
  phase: 'awaitingDraw' | 'awaitingDiscard' | 'roundOver' | 'gameOver';
  drewFromDiscardThisTurn: Card | null;
  didMeldThisTurn: boolean;
  roundNumber: number;
  dealerIndex: number;
  roundAcks: Set<string>;
  seed: number;
  config: RummyConfig;
  decks: 1 | 2;
}
```

### Actions

```ts
type Action =
  | { kind: 'drawStock'; playerId }
  | { kind: 'drawDiscard'; playerId }
  | { kind: 'meld'; playerId; cardIds; meldKind: 'set' | 'run'; jokerSubstitutions? }
  | { kind: 'layOff'; playerId; cardId; targetMeldId; jokerRank? }
  | { kind: 'discard'; playerId; cardId }
  | { kind: 'ackRound'; playerId };
```

---

## Config defaults

```ts
{
  allowDuplicateSuitSet: false,
  aceHighLow: false,
  aceScoreHigh: 15,
  takeMultipleDiscard: false,
  allowSameDiscard: false,
  noReshuffle: false,
  ownMeldsOnly: false,
  rummyBonusMultiplier: 2,
  scoringMode: 'winnerTakesAll',
  targetScore: 100,
  jokersWild: 0,
  allowJokerReplacement: false,
  goOutRequiresDiscard: true,
  meldFirstTurnLocked: false,
}
```

---

## Testing

- **Unit tests** (`__tests__/rummy-core.test.ts`) cover every §11 edge
  case: set/run legality, ace-low default + ace-high-low variant (with
  no-wrap rule), stock-depletion reshuffle, noReshuffle round-end,
  can't-discard-just-drawn rule, lay-offs to runs (low and high end)
  and sets, joker-in-meld, 2/3/4/5/6-player deal sizes, two-deck
  detection, determinism.
- **Invariants**: 52 cards always accounted for across 30 random
  actions; no card in two zones at once.
- **Snapshots**: seeded 2-player deal.
- **Legacy adapter tests** (`__tests__/rummyEngine.test.ts`,
  `rummyStrategy.test.ts`) continue to pass against the adapter's
  preserved `isValidMeld` export and `publicData.melds` shape.

Run:

```bash
cd apps/socket-service
npx jest __tests__/rummy-core.test.ts
npx jest __tests__/rummyEngine.test.ts
```

---

## Non-goals

- Not Gin Rummy (`ginrummy/`) — different melding/knock mechanics.
- Not 500 Rummy or Canasta (`canasta/`) — different scoring + rules.
- No UI / sound / animation hooks.
