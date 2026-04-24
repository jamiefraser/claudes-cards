# Idiot (a.k.a. Shithead / Shed / Karma)

2–5 player shedding game with a distinctive hand / face-up / face-down
tableau and a handful of power cards that break the normal ordering.
Not to win — to **not be last**. Whoever finishes their three zones
first places 1st, the last one still holding cards is the **Idiot**.

This directory contains two modules:

| File        | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `getPublicView`, plus helpers (`rankIsLegal`, `activeZoneOf`). |
| `engine.ts` | `IGameEngine` adapter. Maps frontend actions (`swap`, `ready`, `play`, `play-face-down`, `pickup`) to core `Action` shapes; projects a UI-friendly `publicData`. |

---

## Rules summary

### Deck

- 2–5 players → one standard 52-card deck.
- 6 players → two decks (104 cards). Auto-selected in `newGame`.
- No jokers (configurable; default off).
- Suits are cosmetic — only ranks matter for play.

### Deal (per spec §3)

1. Three face-down cards per player, in a row.
2. Three face-up cards on top of them.
3. Three hand cards.
4. Remaining cards form the stock.

### Swap phase

Before play begins, each player may swap cards between their hand and
their face-up row freely. When every player has signalled `ready`,
play begins. Swaps are fully reversible until `ready` is submitted.

### Opening play

The player holding the lowest 3 (or if nobody has a 3, the lowest 4,
then 5, …) opens. Ties resolved by seat order. Canonically, the
opener's first play **must include** that lowest card — enforced by
the engine and configurable via `firstPlayMustIncludeLowest`.

### A turn

Each player plays from the highest-priority non-empty zone:

1. **Hand** — played from while cards remain. Refilled to 3 from
   stock after every hand-zone play.
2. **Face-up** — unlocks once hand and stock are both empty.
3. **Face-down** — the last resort; chosen blind.

On each turn:

1. Play one or more cards of the **same rank** from the active zone.
2. Resolve special effects (§Power cards).
3. Refill hand from stock if playing from the hand zone.
4. Turn passes (unless a burn triggers another turn for the same player).

#### Blind face-down plays

The player picks a face-down card without looking. Flip it face-up onto
the pile. If legal → proceed normally. If illegal → the player picks up
the entire discard pile (plus the exposed card) into their hand; the
face-down count still decreases by one either way.

### Power cards

| Rank | Effect |
| :--: | ------ |
| `2`  | **Reset.** Always legal. Pile requirement resets to `any`. |
| `10` | **Burn.** Always legal. Entire discard pile is removed from play. Same player plays again. |
| `8`  | **Transparent** (default on). Legal only if the current requirement allows it (the 8 isn't free). After it's played, the requirement is **unchanged** from what it was before the 8. Stacking `8 … 8 … 8` extends the transparency. On an empty pile, next requirement becomes `any`. |
| `7`  | **Lower-next** (variant, off by default). After a 7, next card must be ≤ 7. |

Plus the universal **four-of-a-kind burn**: whenever the top four
contiguous cards of the discard pile share a rank, the pile burns and
the same player plays again. Can trigger via a single four-of-a-kind
play or by stacking the fourth copy across multiple turns.

### Pick-up

If no play is legal, the player picks up the entire discard pile into
their hand. Face-up / face-down zones are unaffected. Pile requirement
resets to `any` for the next player.

By default, voluntary pickups (when legal plays exist) are disallowed.
Toggle with `allowVoluntaryPickup`.

### Winning

A player "wins" — in the sense of *finishing* — the moment their hand,
face-up, and face-down zones are all empty. Their finish order is
recorded in `finishedOrder`. Play continues among the remaining
players. The last one left with cards is the Idiot.

Engine reports `computeResult()` rankings with the Idiot placed last.

---

## State model

```ts
{
  players: PlayerState[];   // id, hand, faceUp, faceDown, ready, finishedPlace
  stock: Card[];
  discard: Card[];          // discard[last] is the top
  burned: Card[];           // out-of-play (10 / four-of-a-kind burns)
  pileRequirement:
    | { kind: 'any' }
    | { kind: 'geq'; rank: Rank }
    | { kind: 'leq'; rank: Rank };
  currentPlayerIndex: number;
  direction: 1 | -1;        // CW only in canonical rules
  phase: 'swap' | 'play' | 'gameOver';
  turnNumber: number;
  finishedOrder: string[];  // 1st, 2nd, ...
  firstPlayLowestCardId: string | null;
  seed: number;
  config: IdiotConfig;
}
```

### Actions

```ts
type Action =
  | { kind: 'swap'; playerId; handCardId; faceUpCardId }
  | { kind: 'ready'; playerId }
  | { kind: 'playFromHand'; playerId; cardIds: string[] }
  | { kind: 'playFromFaceUp'; playerId; cardIds: string[] }
  | { kind: 'playFromFaceDown'; playerId; cardId: string }
  | { kind: 'pickUpPile'; playerId };
```

---

## Config defaults

```ts
{
  eightMode: 'transparent',        // '8 sees through' — Interpretation B
  sevensLower: false,              // variant: after 7, next must be ≤ 7
  faceUpRequiresEmptyStock: true,  // canonical: face-up locked until stock done
  firstPlayMustIncludeLowest: true,
  allowVoluntaryPickup: false,
  decks: 1,                        // forced to 2 at 6p
}
```

---

## Testing

- **Unit tests** (`__tests__/idiot-core.test.ts`) cover every §12 edge
  case: swap phase, opener, normal plays, multi-card plays, all four
  power-card mechanics (2 reset, 10 burn, transparent 8, 4-of-a-kind
  burn), 7-lower variant, pick-up, zone transitions (hand → face-up →
  face-down), blind face-down legal + illegal outcomes, placement
  ordering, winner skip in rotation, determinism.
- **Invariants**: card conservation (52 or 104 cards always accounted
  for) across 80 random actions; no card in two zones simultaneously.
- **Snapshots**: full seeded 3p deal.
- **Adapter tests** (`__tests__/idiotEngine.test.ts`) cover metadata,
  2–6p range, deal sizes, 6p two-deck switch, publicData shape,
  swap→ready→play transition, legal action translation.

Run:

```bash
cd apps/socket-service
npx jest __tests__/idiot-core.test.ts
npx jest __tests__/idiotEngine.test.ts
```

---

## Non-goals

- No "runs" (3-4-5 as a ladder) — Idiot is strictly rank-only matching.
- No reversal cards; direction is always clockwise in canonical play.
- No variant scoring — placement-based only (the Idiot gets the last
  rank; everyone else ranks by finishing order).
- No animation / real-time hooks; all timing is turn-based.
