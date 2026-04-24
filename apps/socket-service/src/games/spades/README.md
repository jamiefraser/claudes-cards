# Spades

Partnership trick-taking game. Four players pair into two teams
(North-South vs East-West). Players bid the number of tricks they
expect, then play them out with spades as the permanent trump. Make
your bid exactly for the main score; each overtrick is a "bag" that
accumulates across rounds, with a −100 penalty every tenth one.

Individual variants for 2 and 3 players are supported.

This directory contains two modules:

| File        | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `legalPlayCardIds`, `isEligibleForBlindNil`, `getPublicView`. |
| `engine.ts` | `IGameEngine` adapter. Maps `bid` / `play` / `ack-round` action types to core Actions; projects `publicData` with legacy `teamScores`, `bids`, `tricksTaken`, `spadesBroken`, `dealerIndex` plus spec-added `partnerships`, `sandbags`, `bidKinds`. |

---

## Rules summary

### Deck + deal

- Standard 52-card deck, no jokers by default.
- 4 players: 13 cards each.
- 3 players: 13 cards each; **2♣ removed**.
- 2 players: 13 cards each (26 undealt per spec note — adopt canonical deal).
- **Jokers variant** (opt in with `useJokers: true`): 2♣ and 2♦
  removed, Big Joker and Little Joker added. Jokers rank at the top
  of the spade order (Big > Little > A♠ > K♠ …).

### Partnerships (4p)

- Seats 0, 2 → North-South.
- Seats 1, 3 → East-West.
- 2- and 3-player variants play individually (`partnershipId: null`).

### Bidding

Bidding starts left of the dealer and goes clockwise. Each player bids
exactly once.

Bid kinds:
- `{ kind: 'number', n }` — claim `n` tricks (0..13).
- `{ kind: 'nil' }` — promise to take 0 tricks (+100 / −100).
- `{ kind: 'blindNil' }` — same, but placed before seeing the hand.
  Only eligible when (a) `allowBlindNil` is on and (b) the partnership
  trails by at least `blindNilBehindThreshold` (default 100).

Partnership contract = sum of partners' number bids. A partner's nil
tricks do **not** count toward the other partner's contract (canonical
rule).

### Play

- The player to the left of the dealer leads the first trick.
- **Spades may not be led until broken** (played as a discard or a
  trump). A hand of pure spades overrides this constraint.
- Follow suit if possible; otherwise play anything.
- Highest trump wins. If no trump, highest of the led suit wins.
- Winner of each trick leads the next.

Jokers, when enabled, are treated as spades for the "broken" rule and
always outrank every other card.

### Scoring

- **Contract made**: `10 × bid + 1 × overtricks`. Each overtrick adds a
  bag to the partnership's persistent bag counter.
- **Contract failed**: `−10 × bid`.
- **Nil success**: `+nilBonus` (default 100).
- **Nil failure**: `−nilBonus`.
- **Blind nil**: `±blindNilBonus` (default 200).
- **10-bag penalty**: every time a partnership's bags reach 10,
  `−bagPenaltyPerTen` points (default 100) and bags decrement by 10.

Individual variants halve the nil bonuses (to 50 / 100).

### Game end

- A partnership reaching `targetScore` (default 500) wins.
- A partnership falling to `lowerLimit` (default −200) loses.
- Both conditions produce `phase: 'gameOver'`.

---

## State model

```ts
{
  players: PlayerState[];              // id, seat, partnershipId, hand, bid, tricksTakenCount, handRevealed
  partnerships: Partnership[];         // NS + EW for 4p; empty for 2/3p (individual)
  dealerIndex: number;
  currentPlayerIndex: number;
  currentTrick: Trick | null;
  completedTricks: Trick[];
  phase: 'bid' | 'play' | 'roundOver' | 'gameOver';
  spadesBroken: boolean;
  roundNumber: number;
  seed: number;
  config: SpadesConfig;
  roundAcks: Set<string>;
}
```

### Actions

```ts
type Action =
  | { kind: 'placeBid'; playerId; bid: Bid }
  | { kind: 'playCard'; playerId; cardId }
  | { kind: 'ackRound'; playerId };
```

---

## Config defaults

```ts
{
  targetScore: 500,
  lowerLimit: -200,
  useJokers: false,
  allowBlindNil: false,
  blindNilBehindThreshold: 100,
  bagPenaltyPerTen: 100,
  nilBonus: 100,
  blindNilBonus: 200,
  startingDealerIndex: 0,
}
```

---

## Testing

- **Unit tests** (`__tests__/spades-core.test.ts`) cover every §10
  edge case: leader can't lead spades before broken (with exception
  for all-spade hands), void-player trump, spade discard breaks
  spades, nil success and failure, partnership contract scoring
  (exact / over / under), sandbag 10-threshold penalty, 500-target
  game end, blind-nil eligibility, 3-player setup (2♣ removed),
  jokers variant (2♣ + 2♦ removed, Big/Little added), determinism,
  spades-broken monotonicity.
- **Adapter tests** (`__tests__/spadesEngine.test.ts`) verify the
  platform surface: 2–4 player range, deal sizes, bidding phase
  action enumeration, spades-not-broken error from the leader.

Run:

```bash
cd apps/socket-service
npx jest __tests__/spades-core.test.ts
npx jest __tests__/spadesEngine.test.ts
```

---

## Non-goals

- No "Mirrors" or similar bid-structure variants.
- No UI / animation / sound hooks.
- No partnership communication outside the bid itself.
