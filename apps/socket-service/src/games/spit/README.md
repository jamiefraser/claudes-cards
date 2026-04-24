# Spit (a.k.a. Speed)

Real-time, strictly 2-player card game. Each player has a 1-2-3-4-5
pyramid of stockpile columns and an 11-card face-down spit pile. Two
centre piles sit between the players. Both players race simultaneously
to play stockpile tops onto either centre if the rank is adjacent (±1,
with A↔K wrap by default). When both players are stuck, either may
call "Spit!" to flip a new centre card. A round ends when a player
empties their pyramid and slaps a centre.

This directory contains two modules:

| File        | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `core.ts`   | Pure logic. Deterministic via seeded PRNG. Exposes `newGame`, `start`, `applyAction(state, action, timestamp)`, `legalPlays`, `isStuck`, `isBothStuck`, `canPlayOn`, `buildLayout`, `startNextRound`, `replay`, `getPublicView`. |
| `engine.ts` | `IGameEngine` adapter. Auto-starts the first round at `startGame`; maps `play` / `spit` / `slap` / `ack-round` to core Actions; projects `publicData` with per-player column tops/depths, centre tops/counts, `spitAvailable`. |

---

## Rules summary

### Deck + setup

- Standard 52-card deck, no jokers.
- 26 cards per player: 15 in the pyramid (columns 1..5 have 1..5 cards
  each, top-of-each face-up) and 11 in the face-down spit pile.
- Suits are cosmetic — only ranks matter.

### Start of round

Both players simultaneously flip their top spit-pile card into a
centre, creating two centre piles. Play begins immediately.

### Real-time play

There are no turns. Either player may at any time play the top card of
any of their 5 columns onto either centre pile if it is **exactly one
rank higher or lower** than the centre's top (A connects to both 2 and
K when `wrapRanks: true`, the canonical default).

After a play, the newly-exposed column top is face-up and immediately
available. Play continues until **both** players are stuck.

### Spit (reset)

When both players are stuck, either may call `spit`:

- Each player flips their next spit-pile card onto their respective
  centre — new centre tops, play resumes.
- If only one player's spit pile is empty, only the other flips.
- If **both** spit piles are empty (double-empty stalemate), the round
  resolves by the shortest-stockpile rule: the player with fewer
  stockpile cards wins; a tie is a draw. Toggleable via
  `stalemateShortestWins`.

### Slap (round end)

Once a player empties **all 5 stockpile columns**, they may slap either
centre pile. Convention: slap the smaller one. The slapped pile becomes
theirs; the opponent gets the unslapped pile. Each player's new deck
for the next round is:

- **Winner**: slapped centre + remaining spit pile.
- **Loser**: unslapped centre + remaining spit pile + remaining column
  cards.

A new pyramid is built from each player's new deck (as deep as possible
from left to right; columns beyond the available cards stay empty).

### Match end

If a player's new deck cannot build even column 1, they lose the match.
Toggleable via `playToMatchEnd` (default true).

---

## Concurrency model

Spit is nominally real-time but the engine is fully deterministic. Every
action carries a timestamp; `applyAction(state, action, timestamp)`
processes actions strictly in arrival order. Each action is atomic and
either accepted or rejected — the log records both outcomes:

```ts
actionLog: Array<{
  action: Action;
  timestamp: number;
  resolution: 'accepted' | 'rejected';
  reason?: string;
}>
```

Typical conflicts and their resolutions:

- **Same-centre race**: both players aim an adjacent card at the same
  centre. First-received play wins, updating the centre's top; the
  second play is re-validated against the new top and usually rejected.
- **Different-centre race**: both plays succeed; each centre advances
  independently.
- **Slap race**: the slap is an action like any other; earliest
  timestamp wins. Once a slap is accepted, subsequent plays are
  rejected with "Not in play phase".
- **Spit before both-stuck**: rejected.

For replay / testing, use `replay(playerIds, config, seed, log)` to
apply an ordered action log to a fresh game.

---

## State model

```ts
{
  players: [PlayerState, PlayerState];   // columns[5], spitPile[], outOfMatch
  centerPiles: [Card[], Card[]];         // top = last element
  phase: 'setup' | 'playing' | 'roundOver' | 'matchOver';
  spitAvailable: boolean;
  roundNumber: number;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  seed: number;
  config: SpitConfig;
  actionLog: LogEntry[];
}
```

### Actions

```ts
type Action =
  | { kind: 'start' }
  | { kind: 'play'; playerId; columnIndex: 0..4; centerIndex: 0 | 1 }
  | { kind: 'spit'; playerId }
  | { kind: 'slap'; playerId; centerIndex: 0 | 1 };
```

---

## Config defaults

```ts
{
  wrapRanks: true,                 // A ↔ K adjacency
  playToMatchEnd: true,            // continue across rounds
  stalemateShortestWins: true,     // double-empty-spit tiebreak
}
```

---

## Testing

- **Unit tests** (`__tests__/spit-core.test.ts`) cover every §10 edge
  case: 1-2-3-4-5 pyramid deal, `buildLayout` partial decks, wrap-rank
  on/off adjacency, column exposure after play, empty-column play
  rejection, invalid columnIndex rejection, wrong-player rejection,
  both-stuck detection, spit-before-both-stuck rejection, double-empty
  stalemate shortest-wins tiebreak, slap-before-empty rejection,
  round-end pile allocation, loser-runs-out-of-deck match loss, same-
  centre race resolution, different-centre parallel plays, seeded
  determinism, replay consistency.
- **Invariants**: 52 cards always accounted for across player columns,
  spit piles, and centre piles.
- **Snapshots**: seeded initial deal.
- **Adapter tests** (`__tests__/spitEngine.test.ts`) cover metadata,
  exactly-2-player requirement, auto-started first round at
  `startGame`, `currentTurn: null` (real-time), publicData shape,
  play-action payload translation.

Run:

```bash
cd apps/socket-service
npx jest __tests__/spit-core.test.ts
npx jest __tests__/spitEngine.test.ts
```

---

## Non-goals

- No more than 2 players.
- No animations, timing effects, or UI concerns — engine-only.
- No AI "think time" throttling in the core itself; apply at the bot
  layer if needed.
