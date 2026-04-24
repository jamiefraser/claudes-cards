# Whist (Straight / English)

Classic 4-player partnership trick-taking game — the ancestor of
Bridge, Spades, Hearts, and Euchre. No bidding: trump is the suit of
the last card dealt to the dealer, left face-up until their first play.
Partnerships score 1 point per trick won beyond 6; optional honors
(A/K/Q/J of trump in one partnership) add +4 or +2. First to 5 points
(short whist) or 7 (long whist) wins.

This directory contains two modules:

| File        | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `legalPlayCardIds`, `getPublicView`, `startNextHand`. |
| `engine.ts` | `IGameEngine` adapter. Translates `play` / `ack-hand` (or `ack-round`) actions to core Actions; projects `publicData` with legacy fields (`trumpSuit`, `tricksTaken`, `teamScores`, `currentTrick`, `ledSuit`) plus spec-added fields (`turnUpCard`, `partnerships`, `dealerIndex`, `roundNumber`). |

---

## Rules summary

### Deck + setup

- Standard 52-card deck, no jokers.
- 13 cards per player (4 players exactly).
- The last card dealt (to the dealer) is the **turn-up** — placed
  face-up; its suit is trump. The dealer keeps it in hand; the card
  remains visible until they play their first card of the round.

### Partnerships

- Seats 0, 2 → North-South.
- Seats 1, 3 → East-West.

### Play

- The player to the **left of the dealer** leads the first trick.
- Must follow suit if possible; otherwise play any card.
- Highest trump wins. If no trump played, highest of the led suit wins.
- Winner of each trick leads the next.

### Scoring

- **Trick points**: 1 point per trick taken **beyond 6** (canonical
  "odd tricks" scoring). 7 tricks = 1 pt, 13 tricks (slam) = 7 pts.
- **Honors** (optional, `countHonors`): if one partnership holds all
  four trump honors (A/K/Q/J), +4 points; three of four, +2.
- Only one partnership scores trick points per hand; the other gets 0.

### Game end

- First partnership to `targetScore` wins (5 = short, 7 = long).
- Optional **rubbers**: best-of-3 games (`playRubbers: true`).

### No-trump variant

`noTrumpVariant: true` skips the turn-up and plays trumpless; trick
resolution is purely by the led suit.

---

## State model

```ts
{
  players: PlayerState[];                   // id, seat, partnershipId, hand
  partnerships: Partnership[];              // NS + EW with score, tricksThisHand, gamesWon
  dealerIndex: number;
  trumpSuit: Suit | null;                   // null under noTrumpVariant
  turnUpCard: Card | null;                  // null once dealer has played
  currentTrick: Trick | null;
  completedTricks: Trick[];
  currentPlayerIndex: number;
  phase: 'play' | 'handOver' | 'gameOver';
  roundNumber: number;
  seed: number;
  config: WhistConfig;
  roundAcks: string[];                 // array, not Set — see CLAUDE.md rule 17
  dealerHasPickedUpTurnUp: boolean;
  rubberWinnerId: PartnershipId | null;
}
```

### Actions

```ts
type Action =
  | { kind: 'playCard'; playerId; cardId }
  | { kind: 'ackHand'; playerId };
```

---

## Config defaults

```ts
{
  targetScore: 5,           // 5 = short whist, 7 = long
  countHonors: false,       // skip honors scoring by default
  noTrumpVariant: false,    // enable trumpless play
  playRubbers: false,       // best-of-3 games when true
  startingDealerIndex: 3,   // dealer seat for the first hand
}
```

---

## Testing

- **Unit tests** (`__tests__/whist-core.test.ts`) cover every §9 edge
  case: 4-player deal + trump from turn-up, no-trump variant skips
  turn-up, partnership seats, leader left-of-dealer, follow-suit
  enforcement + void-player trumping, trick resolution (highest trump,
  else highest led suit), dealer picks up turn-up on first play,
  scoring (1 pt/overtrick, grand-slam +7, losing partnership 0),
  honors +4 / +2, short-whist and long-whist targets, hand-over vs
  game-over phase transitions, determinism.
- **Invariants**: 13 tricks per hand; only one partnership scores
  trick points per hand.
- **Snapshots**: seeded 4p deal (seed=7).
- **Adapter tests** (`__tests__/whistEngine.test.ts`) cover metadata,
  4-player requirement, 13-card deal, `play` action translation.

Run:

```bash
cd apps/socket-service
npx jest __tests__/whist-core.test.ts
npx jest __tests__/whistEngine.test.ts
```

---

## Non-goals

- No bidding variants (Solo Whist, Bid Whist are separate games).
- No UI / animation hooks.
- No rubber bonuses beyond the canonical game count.
