# Oh Hell! (a.k.a. Blackout / Nomination Whist / Up the River)

3–7 player bidding trick-taking game. Each round changes hand size;
bids must be exact — take one too many or one too few and score zero.
The dealer bids last and canonically cannot bid a value that would
balance the round, guaranteeing at least one miss per deal.

This directory contains two modules:

| File        | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `legalBids`, `forbiddenBids`, `scoreForPlayer`, `arcRounds`, `getPublicView`. |
| `engine.ts` | `IGameEngine` adapter. Translates frontend actions (`bid`, `play`, `ack-round`) to core `Action` shape; projects a UI-friendly `publicData`. |

---

## Rules summary

### Deck

- Standard 52-card deck, no jokers (configurable: 0/1/2).
- Ranks low→high: `2 3 4 5 6 7 8 9 10 J Q K A`. Ace is always high.
- Jokers, when enabled, always outrank every other card and count as
  the highest trump regardless of the round's trump suit.

### Hand-size arc

| Arc      | Shape         | Rounds |
| -------- | ------------- | -----: |
| `up`     | 1 → M         | M      |
| `down`   | M → 1         | M      |
| `upDown` | 1 → M → 1     | 2M − 1 |
| `downUp` | M → 1 → M     | 2M − 1 |

`M = floor(51/N)` (or `floor((51 + jokers)/N)` with jokers enabled).
Default arc is `upDown`.

Examples:
- 3 players → M = 17, 33 rounds.
- 4 players → M = 12, 23 rounds.
- 7 players → M = 7, 13 rounds.

### Deal + trump

1. Shuffle the whole deck at the start of each round.
2. Deal `handSize(round)` cards per player.
3. Flip the next card face-up — it's the **turn-up**. Its suit is the
   round's trump.
4. With `lastRoundNoTrump: true` (default), any 1-card round is played
   no-trump regardless of the turn-up's suit.

### Bidding

Starts with the seat immediately left of the dealer; the dealer bids
**last**. Bids range `0..handSize`.

Canonical **hook rule** (`hookRule: 'dealerBlocked'`, default): the
sum of every round's bids cannot equal `handSize`. Since the dealer
bids last, at most one value is forbidden to them — guaranteed at
least one bid to miss each round. Disable with `hookRule: 'noHook'`.

### Play

- The player immediately left of the dealer leads the first trick.
  Winner of each trick leads the next.
- Must follow the led suit if possible; otherwise may play anything,
  including trump.
- Highest trump wins; if no trump played, highest of led suit wins.
- Jokers (when enabled) always beat any other card. Joker-led tricks
  count as leading trump; followers follow trump if they can.

### Scoring

Three modes (`scoringMode`):

| Mode         | Exact bid          | Miss                              |
| ------------ | ------------------ | --------------------------------- |
| `standard` (default) | `fixedWinBonus + bid` (default 10 + bid) | `0`                    |
| `overUnder`  | `fixedWinBonus + bid` | `5` if off by 1, else `0`         |
| `penalty`    | `bid`              | `-abs(taken - bid)`                |

Zero-bid made exactly uses `zeroBidScore`:

- `flat10` (default): 10
- `5PlusRound`: `5 + roundNumber`

### Game end

Game ends after the last round of the arc. Highest cumulative score
wins; ties share the rank.

---

## State model

```ts
{
  players: PlayerState[];             // id, seat, hand, bid, tricksWon, scoreTotal
  dealerIndex: number;
  roundNumber: number;
  rounds: number[];                    // handSize per round (frozen at newGame)
  handSize: number;                    // current round
  trumpSuit: Suit | null;              // null on no-trump rounds
  turnUpCard: Card | null;
  currentTrick: Trick | null;
  completedTricksThisRound: Trick[];
  currentPlayerIndex: number;
  phase: 'bid' | 'play' | 'roundOver' | 'gameOver';
  roundAcks: Set<string>;
  seed: number;
  config: OhHellConfig;
}
```

### Actions

```ts
type Action =
  | { kind: 'placeBid'; playerId; bid }
  | { kind: 'playCard'; playerId; cardId }
  | { kind: 'ackRound'; playerId };
```

---

## Config defaults

```ts
{
  handArc: 'upDown',
  hookRule: 'dealerBlocked',
  lastRoundNoTrump: true,
  scoringMode: 'standard',
  zeroBidScore: 'flat10',
  jokers: 0,
  bidsVisible: true,
  fixedWinBonus: 10,
  startingDealerIndex: 0,
}
```

---

## Testing

- **Unit tests** (`__tests__/ohhell-core.test.ts`) cover every §11 edge
  case: arc shapes (up / down / upDown / downUp), round-count math for
  3–7 players, bidding + hook rule (blocked and noHook), bid range
  validation, last-round-no-trump toggle, trump derivation from turn-up,
  exact-bid scoring + miss scoring + zero-bid variants + overUnder +
  penalty modes, follow-suit validation, card-not-in-hand rejection,
  determinism, public view visibility.
- **Invariants**: sum of tricks per round = handSize; forbiddenBids
  empty until all non-dealers have bid.
- **Snapshots**: full seeded 4p round-1 deal.
- **Adapter tests** (`__tests__/ohHellEngine.test.ts`) cover metadata,
  3–7p range, deal sizes, determinism via roomId hash, publicData
  shape, bid-action translation.

Run:

```bash
cd apps/socket-service
npx jest __tests__/ohhell-core.test.ts
npx jest __tests__/ohHellEngine.test.ts
```

---

## Non-goals

- No partnerships — individual play only.
- No UI / sound / animation hooks.
- No tournament/cumulative metagame — one game is one arc.
