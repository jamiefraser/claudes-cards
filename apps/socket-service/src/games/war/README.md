# War

Pure-chance card game for 2, 3, or 4 players. Standard 52-card deck, no jokers,
Ace always high, suits cosmetic only.

This directory contains two modules:

| File        | Purpose                                                               |
| ----------- | --------------------------------------------------------------------- |
| `core.ts`   | **Pure game logic.** No I/O, no platform types. Deterministic via seeded PRNG. Exposes `newGame`, `step`, `playToCompletion`, `getPublicView`. |
| `engine.ts` | **Platform adapter.** Wraps `core` in the `IGameEngine` interface used by the socket service. Stores core state under `publicData.core`. |

The pure module is self-contained — it can be extracted into its own package
with no changes. The adapter is the integration layer.

---

## Rules summary

### Setup

- Shuffle the full 52-card deck with a seeded PRNG (mulberry32).
- Deal round-robin, face-down, to each player's **stock**:
  - **2 players** → 26 each.
  - **3 players** → 17 each. The **2♠** is removed before shuffling so 51
    divides evenly; see [the 3-player removed card](#3-player-removed-card) below.
  - **4 players** → 13 each.
- Each player starts with an empty **winnings** pile.

Both piles are **ordered queues**: draw from index 0 of the stock, append won
cards to the end of the winnings pile.

### Turn (battle)

Every active player simultaneously reveals the top of their stock.

1. **Unique highest rank** → that player wins every card currently on the
   table. Cards go to the bottom of the winner's winnings pile in the
   [documented order](#card-add-order-to-winnings).
2. **Tie for highest** → a **war** (see below) begins among the tying
   players only. Non-tying players' revealed cards stay on the table and
   go to whoever eventually wins.

### War

When two or more players tie for the highest rank:

1. Each warring player commits **3 cards face-down** (the "spoils") on top
   of their previously revealed card.
2. Each warring player reveals **1 more card face-up**.
3. Compare the newly revealed cards:
   - Unique highest → winner takes the whole table (original reveals
     from all players + all spoils + all war reveals).
   - New tie → recursive war among the newly tying players.
     Players whose new reveal was lower exit the war; their cards stay
     on the table for the eventual winner.

### Insufficient cards during war

- A player with **fewer than 4 cards** commits all they have. Their last
  card becomes the face-up comparison card; everything earlier is a
  face-down spoil.
- A player with **zero cards** at war time is **eliminated immediately**
  and **forfeits** any table cards from the current battle.
- If a player **ties in war but has no more cards** they lose the war by
  default (the spec treats "no face-up" as losing).

### Stock empties

- At any point — start of turn or mid-war — a player whose stock is empty
  but who has cards in their winnings pile **reshuffles** the winnings
  into a new stock. `reshuffleMethod: "shuffle"` (the default) is what
  house rules specify to prevent cycles; `"preserveOrder"` is available
  for testing and reproducing classic scenarios.
- A player whose stock **and** winnings are both empty is **eliminated**.

### Game over

- Single player left with cards → that player wins.
- `turnNumber >= maxTurns` (default 10 000) → the player with the most
  total cards wins; on a perfect tie, `winnerId = null` (declared draw).
  `forcedByMaxTurns = true` in the final state flags this path.

---

## Card-add order to winnings

When a battle is won, every card currently on the table is appended to the
winner's winnings pile in a fixed, documented order:

1. **Winner's own cards first**, in the order they were placed on the
   table (reveal, then any spoils they committed, then any war reveals).
2. **Other seats' cards next**, traversed **clockwise** starting from the
   seat immediately after the winner. Within each seat, the same
   insertion order is preserved.

This is **deterministic** — given a seed, the whole game plays out
identically every time. Randomising the add-order would defeat seeded
replay and make many edge cases untestable.

Example (3 players, p1 wins a battle where p0/p2 both revealed and p1
had a face-up king):

```
pickup order:  p1, p2, p0        # clockwise from winner
final winnings (bottom → top):
  p1's king, p2's card, p0's card
```

---

## 3-player removed card

Three players can't receive an equal deal from 52. Following the
classic Hoyle's variant, **one card is removed** before shuffling and
**that card is not in play**. This implementation removes the **2 of
spades (2♠)** every 3-player game. The choice is:

- **Deterministic** — same seed produces the same game regardless of
  what the shuffler would otherwise have done with the 2♠.
- **Harmless** — the 2♠ is the lowest-rank card and its absence
  doesn't meaningfully change the statistics of war resolution.
- **Documented** — `GameState.removedCard` carries the removed card so
  a viewer (or test) can introspect.

---

## API

```ts
import {
  newGame,
  step,
  playToCompletion,
  getPublicView,
  type GameState,
  type WarConfig,
  type PublicGameState,
} from './core';

const state: GameState = newGame(
  { playerCount: 3, maxTurns: 10_000, reshuffleMethod: 'shuffle' },
  /* seed */ 42,
);

const next: GameState = step(state);          // advance one battle / war round
const end:  GameState = playToCompletion(state); // step until phase === 'gameOver'

const view: PublicGameState = getPublicView(state, 'p0');
//   - per-player { id, stockCount, winningsCount, eliminated }
//   - table entries with face-down cards hidden (card = null)
//   - warDepth, warParticipants, winnerId, removedCard
```

`applyAction(state, action)` is not exposed separately — War has no
player decisions, so `step()` is the only advancement function.
The platform adapter (`engine.ts`) maps the socket layer's
`applyAction(state, playerId, { type: 'flip' })` onto `step()`.

### `state: GameState` shape

```ts
{
  players: PlayerState[];
  turnNumber: number;
  phase: 'awaitingBattle' | 'resolvingWar' | 'gameOver';
  table: { entries: Array<{ playerId, card, faceDown }> };
  warDepth: number;           // 0 between battles, increments per war round
  warParticipants: string[];  // tying players in the current war
  winnerId: string | null;    // null on max-turns draw
  seed: number;
  config: WarConfig;
  removedCard: Card | null;   // 2♠ for 3p, null otherwise
  forcedByMaxTurns: boolean;  // true on safeguard termination
}
```

---

## Testing

- **Unit tests** (`__tests__/war-core.test.ts`) cover every §10 edge case:
  basic battle, simple war, double war, war with 3 / 1 / 0 cards left,
  reshuffles, 3p/4p variants, multi-rank ties, max-turns safeguard,
  determinism, card-add order, 3p removed card.
- **Invariant tests**: card conservation (52 or 51 total across piles + table
  at every step), no duplicate-ids, statistical termination (500 seeded
  games with `reshuffleMethod: 'shuffle'` always end within `maxTurns`).
- **Snapshot tests**: final state for `(2p, seed=1)` and `(4p, seed=2024)`
  is committed so any regression in shuffle or deal logic surfaces
  immediately.
- **Determinism test**: `newGame(cfg, seed)` followed by `playToCompletion`
  produces identical player piles for the same seed + config.
- **Adapter tests** (`__tests__/warEngine.test.ts`) exercise the
  `IGameEngine` surface: metadata, deal sizes per variant, `flip` action,
  ranking, roomId-based determinism.

Run:

```bash
# from apps/socket-service
npx jest __tests__/war-core.test.ts
npx jest __tests__/warEngine.test.ts
```

---

## Non-goals

- **No AI / strategy.** War has no player decisions; the `GenericBot`
  strategy (`bots/strategies/generic.strategy.ts`) just emits `{ type:
  'flip' }` on every bot turn.
- **No house-rule variants** beyond `playerCount` and `reshuffleMethod`.
  Peace, slap, tribute — not implemented.
- **No animations or UI.** Visual concerns live in the frontend.
