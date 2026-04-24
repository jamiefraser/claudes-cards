# Euchre

4-player partnership trick-taking with a 24-card deck (9, 10, J, Q, K, A
in each suit). Distinctive feature: the **bower** system makes the jack
of trump (right bower) and the jack of the same colour (left bower) the
two highest trump cards. First partnership to 10 points wins.

This directory contains two modules:

| File        | Purpose                                                             |
| ----------- | ------------------------------------------------------------------- |
| `core.ts`   | **Pure game logic.** No I/O, deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `getPublicView`, `startNextHand`, `isTrumpCard`, `effectiveSuit`, `leftBowerSuitOf`. |
| `engine.ts` | **Platform adapter.** Wraps `core` in `IGameEngine`. Maps frontend actions (`bid` / `discard` / `play` / `ack-hand`) into core actions. |

---

## Rules summary

### Deck

- 24 cards: 9, 10, J, Q, K, A of each of the four suits.
- No jokers by default (`useJokers: false`; not yet implemented).
- **Partnerships**: seats 0 & 2 (NS) vs seats 1 & 3 (EW).

### Trump ranking

Once trump is declared, the trump suit re-ranks:

```
Right Bower  = Jack of trump suit        (highest trump)
Left Bower   = Jack of same-colour suit  (2nd highest trump)
Ace of trump > King > Queen > 10 > 9
```

The **left bower counts as trump**, NOT as a card of its visual suit.
This is the single biggest Euchre bug source. See `isTrumpCard` and
`effectiveSuit` in `core.ts` — every play / following-suit decision
runs through them.

Example: if trump is ♠, then J♣ is the left bower. It's a trump.

- Lead ♣, hand has J♣ + K♣: you **must** play K♣ (the real club).
  J♣ is a trump, doesn't follow ♣.
- Lead ♠, hand has J♣ + Q♣: you **must** play J♣ (it counts as a
  trump, following the spade lead).

### Setup

1. Shuffle. Deal 5 cards to each player (simple 1-at-a-time round
   robin — the 2+3 / 3+2 traditional order doesn't affect the shuffle's
   outcome).
2. Flip the top of the remaining kitty face-up — this is the **turn-up**
   card, the proposed trump.
3. 3 kitty cards remain face-down.
4. Dealer starts at `startingDealerIndex`, rotating clockwise each hand.

### Bidding — two rounds

**Round 1**: starting left of dealer, each player may:
- **Pass**, or
- **Order up** the turn-up's suit as trump. The **dealer picks up the
  turn-up and must discard one card**. If the dealer themselves orders
  up (as the 4th option in round 1), they still pick up + discard.

**Round 2**: if all 4 pass round 1, the turn-up is flipped down and
round 2 begins, starting left of dealer. Each player may:
- **Pass**, or
- **Call any other suit** as trump (the turn-up suit is no longer
  available).

If all 4 pass round 2 and `stickTheDealer: false` (default), **redeal**
with the same dealer. If `stickTheDealer: true`, the dealer is **forced**
to call a trump (their `bidPass` is not a legal action).

### Going alone

When ordering up or calling trump, a player may declare **alone**:

- Their partner sits out (cards hidden, skipped in turn order).
- Play proceeds with 3 active players (soloist + 2 opponents).
- Scoring bonus: if the soloist takes all 5 tricks, score 4 (not 2).

Dealer-partner "assist" (ordering up for dealer's benefit) is fine;
the dealer still picks up.

### Play

Left of dealer leads the first trick.

Follow-suit rule: if you have any card of the led suit (where "led
suit" is the **effective suit** of the led card — accounts for left
bower), you must play one. Otherwise play anything (trump or not).

**Highest trump wins**; if no trump was played, **highest card of
the led suit wins**. Trick winner leads the next. 5 tricks per hand.

### Scoring

The trump-naming side is "makers"; the other is "defenders".

| Outcome                                     | Points | To          |
| ------------------------------------------- | :----: | ----------- |
| Makers take 3 or 4 tricks                   |   1    | Makers      |
| Makers take all 5 (march)                   |   2    | Makers      |
| Makers take all 5 while alone               |   4    | Makers      |
| Makers take 0–2 (euchred)                   |   2    | Defenders   |
| Defenders sweep while defending alone       |   4    | Defenders   |

First partnership to `targetScore` (default 10) wins.

---

## State model

```ts
{
  players: PlayerState[];   // seat, partnership, hand, sittingOut
  scores: { NS: number; EW: number };
  handTricks: { NS: number; EW: number };
  dealerIndex: 0|1|2|3;
  turnUpCard: Card | null;   // null after order-up or round 2 begins
  kitty: Card[];
  trump: TrumpCall | null;
  currentTrick: { ledSuit, plays, winnerId } | null;
  completedTricks: CompletedTrick[];
  currentPlayerIndex: 0|1|2|3;
  phase: 'bidRound1' | 'bidRound2' | 'dealerDiscard' | 'play' | 'handOver' | 'gameOver';
  handNumber: number;
  history: Action[];
  handResult: HandResult | null;
  gameWinner: 'NS' | 'EW' | null;
  seed: number;
  config: EuchreConfig;
}
```

Actions:

```ts
type Action =
  | { kind: 'bidPass'; playerId: string }
  | { kind: 'orderUp'; playerId: string; alone: boolean }
  | { kind: 'callTrump'; playerId: string; suit: Suit; alone: boolean }
  | { kind: 'dealerDiscard'; playerId: string; cardId: string }
  | { kind: 'playCard'; playerId: string; cardId: string };
```

---

## Config defaults

```ts
{
  targetScore: 10,
  stickTheDealer: false,
  allowDefendAlone: false,  // defender-alone sweep bonus (not yet UI-exposed)
  useJokers: false,         // Benny/Best Bower (not yet implemented)
  startingDealerIndex: 0,
}
```

---

## Testing

- **Unit tests** (`__tests__/euchre-core.test.ts`) cover every §11 edge
  case:
  - Bidding flow: order-up, assist, all pass → round 2, all pass
    round 2 → redeal, round 2 can't call rejected suit,
    dealer orders up on own turn, stick-the-dealer forces call.
  - **Left bower**: J♣ played on ♣ lead with trump=♠ → J♣ is trump and
    does NOT follow ♣. J♣ played on ♠ lead with trump=♠ → J♣ DOES
    follow the trump lead.
  - Right bower > left bower in direct trick comparison.
  - Non-trump ordering (9 < 10 < Q < K < A, with J absent).
  - Trump ordering (right > left > A > K > Q > 10 > 9).
  - Any trump beats any non-trump.
  - Scoring: 3-trick make (1), march (2), alone march (4), euchre (2).
  - Alone call: partner sits out, turn order skips them.
  - Dealer picks up turn-up and discards it immediately (legal).
  - Determinism.
- **Invariants**: 5 tricks per hand, trump ordering, correct scoring.
- **Snapshots**: full hand with trump ♠, full hand with dealer order-up,
  full hand with alone call.
- **Adapter tests** (`__tests__/euchreEngine.test.ts`) cover metadata,
  deal shape, basic adapter surface.

Run:

```bash
cd apps/socket-service
npx jest __tests__/euchre-core.test.ts
npx jest __tests__/euchreEngine.test.ts
```

---

## Non-goals

- **Not 24-card Bid Euchre** (separate game with a bidding ladder).
- **Not "Pepper"** (related but distinct).
- **No UI updates** — the existing trick-games bar is what the frontend
  uses. Bidding UI (order-up / pass / call-trump buttons) is TBD.
- **Bot strategy**: uses `GenericBotStrategy` (passes / plays first
  legal). Smart bidding and card play are not yet implemented.
- **`useJokers`** (Benny/Best Bower variant) is declared in config but
  not wired in `core.ts`; leave it false.
