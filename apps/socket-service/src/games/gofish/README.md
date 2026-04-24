# Go Fish

2–6 player matching game. Players ask each other for cards of a specific
rank, collect 4-of-a-kind "books," and the player with the most books
when the stock and all hands are exhausted wins.

This directory contains two modules:

| File        | Purpose                                                             |
| ----------- | ------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `applyAction`, `legalActions`, `getPublicView`. |
| `engine.ts` | `IGameEngine` adapter. Maps frontend `ask` → core `ask` action; projects a UI-friendly `publicData` with `books`, `askLog`, `stockCount`. |

---

## Rules summary

### Deck

- Standard 52-card deck, no jokers.
- Suits are tracked on cards but **irrelevant to play**. Only rank
  matters for matching and booking.

### Deal

Based on player count (per spec §3):

| Players | Cards per player |
| ------- | :--------------: |
| 2       | 7                |
| 3–4     | 7                |
| 5–6     | 5                |

Remaining cards form the **stock**.

At setup, any starting 4-of-a-kind **auto-lays down as a book** in rank
order (deterministic when multiple books exist).

### A turn

1. **Empty hand at start of turn** → the engine auto-draws one card
   from stock (spec §7, `emptyHandRedraw: 'one'` default). Turn ends.
   If stock is empty, the player is skipped.
2. Otherwise, ask another specific player for a specific rank:
   - **Must hold** ≥ 1 card of that rank (strict rule).
   - **Cannot** ask yourself.
   - **Cannot** ask an empty-handed player.
3. Resolve the ask:
   - **Target has the rank**: they hand over ALL matching cards. Asker
     collects them; if that completes a book, lay it down immediately.
     Asker **takes another turn**.
   - **Target does not**: "Go Fish!" Asker draws one card from stock:
     - Drew the rank asked for (**lucky fish**, config
       `luckyFishExtraTurn: true` default): completes a book if 4th
       card, then asker **takes another turn**.
     - Drew any other rank: completes a book if it brings them to 4,
       then **turn passes** to the next player.
     - Stock empty at fish time: no draw; turn passes.

### Books

- 4 cards of the same rank = one book.
- Always laid down immediately on completion — never held in hand.
- Cards in books are out of play.

### Game end

- Normally when all 13 books are complete.
- **Stuck-state detection**: if the stock is empty AND no two players
  share any rank in their hands, no ask can ever succeed. The engine
  ends the game immediately and computes winners from current book
  counts. This prevents pathological infinite loops where players
  endlessly fail to match.

### Winners

- Most books wins. Ties → multiple winners returned.
- Optional `tieBreakByCardCount: true` breaks ties by fewest remaining
  cards. Default false (shared winners).

---

## State model

```ts
{
  players: PlayerState[];   // id, hand, books (ranks)
  stock: Card[];
  currentPlayerIndex: number;
  phase: 'awaitingAsk' | 'gameOver';
  turnNumber: number;
  history: Action[];        // full public log
  winnerIds: string[];      // set at gameOver
  seed: number;
  config: GoFishConfig;
}
```

### Actions in history

Only `ask` is externally applied. The engine produces additional
history entries so public viewers can reconstruct every step:

```ts
type Action =
  | { kind: 'ask'; askerId; targetId; rank }
  | { kind: 'fish'; playerId; drawnRank; matched }     // auto
  | { kind: 'bookLaid'; playerId; rank }               // auto
  | { kind: 'autoDraw'; playerId; drewCard }           // auto
  | { kind: 'turnPass'; fromId; toId };                // auto
```

---

## Config defaults

```ts
{
  luckyFishExtraTurn: true,
  mustRevealLuckyFish: false,
  initialHandSize: 'auto',
  askingRuleStrict: true,
  emptyHandRedraw: 'one',
  tieBreakByCardCount: false,
  startingPlayerIndex: 0,
}
```

---

## Testing

- **Unit tests** (`__tests__/gofish-core.test.ts`) cover every §12
  edge case: ask success (1-card / multi-card / book-completing),
  ask failure → fish (wrong rank / lucky rank / empty stock),
  empty-hand auto-draw, empty-target rejection, self-ask rejection,
  unheld-rank rejection, book auto-lay, game-end on 13 books,
  determinism.
- **Invariants**: 52 cards always accounted for; no player holds a
  complete book; `legalActions` never returns invalid asks; game
  terminates via stuck-state detection + bounded heuristic.
- **Snapshots**: full seeded game (3p and 4p).
- **Adapter tests** (`__tests__/goFishEngine.test.ts`) cover metadata,
  deal sizes (7 / 7 / 7 / 5 / 5), determinism, `publicData` shape,
  legal-action mapping.

Run:

```bash
cd apps/socket-service
npx jest __tests__/gofish-core.test.ts
npx jest __tests__/goFishEngine.test.ts
```

---

## Non-goals

- No variant scoring (all books = 1 point).
- No team play.
- No UI for ask selection — the existing ActionBar falls back to the
  generic bar; the bot strategy drives asks automatically.
