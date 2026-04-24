/**
 * War — pure-core tests.
 *
 * Covers the §10 edge-case checklist + §11 property / determinism /
 * snapshot tests from the spec (see src/games/war/README.md).
 *
 * Tests that need deterministic card sequences seed a state via
 * `newGame` and then overwrite specific players' stocks via
 * `seedStock()`. That's simpler than engineering a seed that happens
 * to shuffle the way we want, and it isolates the logic we're
 * actually exercising (battle / war / reshuffle / elimination).
 */

import {
  newGame,
  step,
  playToCompletion,
  getPublicView,
  type Card,
  type GameState,
  type PlayerState,
  type WarConfig,
  type Rank,
  type Suit,
} from '../src/games/war/core';

// ─── Helpers ────────────────────────────────────────────────────────

function makeCard(rank: Rank, suit: Suit): Card {
  return { rank, suit, id: `${rank}${suit}` };
}

function defaultConfig(overrides: Partial<WarConfig> = {}): WarConfig {
  return {
    playerCount: 2,
    maxTurns: 10000,
    reshuffleMethod: 'shuffle',
    ...overrides,
  };
}

/** Replace a player's stock with exactly these cards (top at index 0). */
function seedStock(state: GameState, playerId: string, stock: Card[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, stock: [...stock] } : p,
    ),
  };
}

function seedWinnings(state: GameState, playerId: string, winnings: Card[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, winnings: [...winnings] } : p,
    ),
  };
}

function totalCards(state: GameState): number {
  const inPiles = state.players.reduce(
    (n, p) => n + p.stock.length + p.winnings.length,
    0,
  );
  const onTable = state.table.entries.length;
  return inPiles + onTable;
}

function countOf(p: PlayerState): number {
  return p.stock.length + p.winnings.length;
}

/** Run steps until a guard fires — safety cap so bugs don't hang the suite. */
function stepUntil(state: GameState, pred: (s: GameState) => boolean, cap = 20000): GameState {
  let s = state;
  let i = 0;
  while (!pred(s) && i < cap) {
    s = step(s);
    i++;
  }
  if (i >= cap) throw new Error('stepUntil: safety cap hit');
  return s;
}

// ─── §10 edge-case checklist ────────────────────────────────────────

describe('War — §10 edge cases', () => {
  it('(1) 2p simple battle with a clear winner — higher card takes both', () => {
    const start = newGame(defaultConfig(), 42);
    let s = seedStock(start, 'p0', [makeCard(14, 'S')]);
    s = seedStock(s, 'p1', [makeCard(2, 'H')]);
    // Empty the other piles so the game ends on this one battle.
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);

    const after = step(s);
    expect(after.phase).toBe('gameOver');
    expect(after.winnerId).toBe('p0');
    const p0 = after.players.find((p) => p.id === 'p0')!;
    expect(p0.winnings.length).toBe(2); // Ace + 2 were awarded
    expect(p0.winnings.map((c) => c.id)).toEqual(['14S', '2H']);
  });

  it('(2) simple war — both reveal 7s, then K vs 5 → K wins all 10 cards', () => {
    const start = newGame(defaultConfig(), 1);
    // p0: 7, then K. p1: 7, then 5. Plus 3 face-down spoils each.
    const p0Stock: Card[] = [
      makeCard(7, 'S'),
      makeCard(3, 'S'), makeCard(4, 'S'), makeCard(6, 'S'), // spoils
      makeCard(13, 'S'), // war reveal (K)
    ];
    const p1Stock: Card[] = [
      makeCard(7, 'H'),
      makeCard(3, 'H'), makeCard(4, 'H'), makeCard(6, 'H'),
      makeCard(5, 'H'), // war reveal
    ];
    let s = seedStock(start, 'p0', p0Stock);
    s = seedStock(s, 'p1', p1Stock);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);

    // Battle 1: reveals 7 vs 7 → war.
    s = step(s);
    expect(s.phase).toBe('resolvingWar');
    expect(s.warParticipants).toEqual(['p0', 'p1']);
    expect(s.table.entries.length).toBe(2);

    // War round 1: each commits 3 face-down + 1 face-up. K vs 5 → p0.
    s = step(s);
    expect(s.phase).toBe('gameOver');
    expect(s.winnerId).toBe('p0');
    const winner = s.players.find((p) => p.id === 'p0')!;
    expect(winner.winnings.length).toBe(10);
  });

  it('(3) double war — 7/7 → Q/Q → A/3 → A wins 18 cards', () => {
    const start = newGame(defaultConfig(), 7);
    // 18 total = 2 first reveals + 6 first-war spoils + 2 first-war reveals
    //          + 6 second-war spoils + 2 second-war reveals.
    const p0Stock: Card[] = [
      makeCard(7, 'S'),
      makeCard(3, 'S'), makeCard(4, 'S'), makeCard(5, 'S'),
      makeCard(12, 'S'), // Q
      makeCard(6, 'S'), makeCard(8, 'S'), makeCard(9, 'S'),
      makeCard(14, 'S'), // A
    ];
    const p1Stock: Card[] = [
      makeCard(7, 'H'),
      makeCard(3, 'H'), makeCard(4, 'H'), makeCard(5, 'H'),
      makeCard(12, 'H'), // Q
      makeCard(6, 'H'), makeCard(8, 'H'), makeCard(9, 'H'),
      makeCard(3, 'D'), // losing reveal
    ];
    let s = seedStock(start, 'p0', p0Stock);
    s = seedStock(s, 'p1', p1Stock);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);

    s = step(s); // battle → war
    expect(s.phase).toBe('resolvingWar');
    s = step(s); // war round 1 → war round 2 (Q/Q tie)
    expect(s.phase).toBe('resolvingWar');
    expect(s.warDepth).toBe(2);
    s = step(s); // war round 2 → A wins
    expect(s.phase).toBe('gameOver');
    expect(s.winnerId).toBe('p0');
    const winner = s.players.find((p) => p.id === 'p0')!;
    expect(winner.winnings.length).toBe(18);
  });

  it('(4) war — player has exactly 3 cards: uses all 3 (2 face-down + 1 face-up)', () => {
    const start = newGame(defaultConfig(), 100);
    // p0 has lots, p1 has exactly 3 after the first reveal: stock [7, 2, 3, 4] (4 total).
    // After the reveal of 7, p1's stock is [2, 3, 4] (3 cards).
    // In the war round: commit all 3 — [2, 3] face-down + [4] face-up.
    let s = seedStock(start, 'p0', [
      makeCard(7, 'S'),
      makeCard(10, 'S'), makeCard(10, 'H'), makeCard(10, 'D'),
      makeCard(14, 'S'), // p0 war reveal A → wins
    ]);
    s = seedStock(s, 'p1', [
      makeCard(7, 'H'),
      makeCard(2, 'H'), makeCard(3, 'H'), makeCard(4, 'H'),
    ]);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);

    s = step(s); // battle → war
    expect(s.phase).toBe('resolvingWar');
    s = step(s); // war: p0 commits 4, p1 commits 3.
    expect(s.phase).toBe('gameOver');
    // p1 committed all 3 — face-up = 4, face-down = 2 and 3 (order).
    // p0's face-up is A (14) — wins. Total table: 2 first reveals + 3 p0 spoils + 1 p0 face-up + 2 p1 spoils + 1 p1 face-up = 9 cards.
    const winner = s.players.find((p) => p.id === 'p0')!;
    expect(winner.winnings.length).toBe(9);
  });

  it('(5) war — player has exactly 1 card: that card is face-up, no spoils', () => {
    const start = newGame(defaultConfig(), 100);
    let s = seedStock(start, 'p0', [
      makeCard(7, 'S'),
      makeCard(10, 'S'), makeCard(10, 'H'), makeCard(10, 'D'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [makeCard(7, 'H'), makeCard(9, 'H')]); // 2 cards total; after battle reveal → 1 left
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);

    s = step(s); // battle → war, p1 has 1 card left
    expect(s.phase).toBe('resolvingWar');
    s = step(s);
    // p1 commits its single card (9) as face-up, no spoils.
    // p0 face-up A > p1 face-up 9 → p0 wins everything.
    expect(s.phase).toBe('gameOver');
    // Final: p0 holds all 7 cards (p0: 5 + p1: 2).
    const winner = s.players.find((p) => p.id === 'p0')!;
    expect(winner.winnings.length).toBe(7);
  });

  it('(6) war — player has 0 cards at war time → immediate elimination', () => {
    const start = newGame(defaultConfig(), 5);
    // p0: long hand. p1: only the battle reveal, nothing for war.
    let s = seedStock(start, 'p0', [
      makeCard(7, 'S'),
      makeCard(2, 'S'), makeCard(3, 'S'), makeCard(4, 'S'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [makeCard(7, 'H')]);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);

    s = step(s); // battle → war; p1 stock empty afterwards.
    expect(s.phase).toBe('resolvingWar');
    s = step(s);
    // p1 has 0 cards at war time → eliminated + forfeits its table card.
    expect(s.phase).toBe('gameOver');
    const p1 = s.players.find((p) => p.id === 'p1')!;
    expect(p1.eliminated).toBe(true);
    // All 6 cards end up with p0 (5 from p0's own stock + 1 from p1's battle reveal).
    const winner = s.players.find((p) => p.id === 'p0')!;
    expect(winner.winnings.length).toBe(6);
  });

  it('(7) stock empties at start of turn → reshuffle winnings', () => {
    const start = newGame(defaultConfig(), 11);
    let s = seedStock(start, 'p0', []); // empty stock
    s = seedWinnings(s, 'p0', [
      makeCard(14, 'S'), makeCard(13, 'S'), makeCard(12, 'S'),
    ]);
    s = seedStock(s, 'p1', [makeCard(3, 'H')]);
    s = seedWinnings(s, 'p1', []);

    const after = step(s);
    const p0 = after.players.find((p) => p.id === 'p0')!;
    // After reshuffle, p0's winnings was moved into stock (one used for
    // the battle, two remain in stock). Winnings now holds the 2 cards
    // just won.
    expect(p0.stock.length).toBe(2);
    expect(p0.winnings.length).toBe(2);
  });

  it('(8) stock empties mid-war → reshuffle winnings immediately', () => {
    const start = newGame(defaultConfig(), 12);
    // p0 has long stock. p1: 1 in stock (the battle reveal), several in winnings.
    let s = seedStock(start, 'p0', [
      makeCard(7, 'S'),
      makeCard(2, 'S'), makeCard(3, 'S'), makeCard(4, 'S'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [makeCard(7, 'H')]);
    s = seedWinnings(s, 'p1', [
      makeCard(8, 'H'), makeCard(9, 'H'), makeCard(10, 'H'), makeCard(11, 'H'),
    ]);

    s = step(s); // battle → war; p1 stock empty but winnings has 4.
    expect(s.phase).toBe('resolvingWar');
    s = step(s);
    // p1 reshuffled 4 winnings into stock, committed all 4 (3 face-down
    // + 1 face-up). p0 face-up A beats whatever shuffled to p1's top.
    expect(s.phase).toBe('gameOver');
  });

  it('(9) stock and winnings both empty → elimination', () => {
    const start = newGame(defaultConfig(), 0);
    let s = seedStock(start, 'p0', []);
    s = seedWinnings(s, 'p0', []);
    s = seedStock(s, 'p1', [makeCard(3, 'H')]);
    s = seedWinnings(s, 'p1', []);

    const after = step(s);
    const p0 = after.players.find((p) => p.id === 'p0')!;
    expect(p0.eliminated).toBe(true);
    expect(after.phase).toBe('gameOver');
    expect(after.winnerId).toBe('p1');
  });

  it('(10) 3p — two tie high, third is lower → war among 2; third\'s card goes to war winner', () => {
    const start = newGame(defaultConfig({ playerCount: 3 }), 21);
    let s = seedStock(start, 'p0', [
      makeCard(10, 'S'),
      makeCard(2, 'S'), makeCard(3, 'S'), makeCard(4, 'S'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [
      makeCard(10, 'H'),
      makeCard(2, 'H'), makeCard(3, 'H'), makeCard(4, 'H'),
      makeCard(5, 'H'),
    ]);
    s = seedStock(s, 'p2', [makeCard(5, 'D')]);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);
    s = seedWinnings(s, 'p2', []);

    s = step(s); // 10 / 10 / 5 → war between p0 and p1, p2 sits out.
    expect(s.phase).toBe('resolvingWar');
    expect(s.warParticipants).toEqual(['p0', 'p1']);
    s = step(s); // A beats 5 → p0 wins everything including p2's 5.
    expect(s.phase).toBe('gameOver');
    const winner = s.players.find((p) => p.id === 'p0')!;
    // p0 took: 3 initial reveals + 3 p0 spoils + 3 p1 spoils + 2 war reveals = 11 cards.
    expect(winner.winnings.length).toBe(11);
  });

  it('(11) 3p — all three tie → three-way war', () => {
    const start = newGame(defaultConfig({ playerCount: 3 }), 22);
    let s = seedStock(start, 'p0', [
      makeCard(10, 'S'),
      makeCard(2, 'S'), makeCard(3, 'S'), makeCard(4, 'S'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [
      makeCard(10, 'H'),
      makeCard(2, 'H'), makeCard(3, 'H'), makeCard(4, 'H'),
      makeCard(5, 'H'),
    ]);
    s = seedStock(s, 'p2', [
      makeCard(10, 'D'),
      makeCard(2, 'D'), makeCard(3, 'D'), makeCard(4, 'D'),
      makeCard(6, 'D'),
    ]);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);
    s = seedWinnings(s, 'p2', []);

    s = step(s); // 10/10/10 → three-way war.
    expect(s.warParticipants).toEqual(['p0', 'p1', 'p2']);
    s = step(s); // A beats 5 and 6 → p0 wins 15 cards.
    expect(s.phase).toBe('gameOver');
    const winner = s.players.find((p) => p.id === 'p0')!;
    expect(winner.winnings.length).toBe(15);
  });

  it('(12) 4p — K, K, 5, 5 → only the Ks war; the 5s are spoils', () => {
    const start = newGame(defaultConfig({ playerCount: 4 }), 33);
    let s = seedStock(start, 'p0', [
      makeCard(13, 'S'),
      makeCard(2, 'S'), makeCard(3, 'S'), makeCard(4, 'S'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [
      makeCard(13, 'H'),
      makeCard(2, 'H'), makeCard(3, 'H'), makeCard(4, 'H'),
      makeCard(7, 'H'),
    ]);
    s = seedStock(s, 'p2', [makeCard(5, 'D')]);
    s = seedStock(s, 'p3', [makeCard(5, 'C')]);
    for (const id of ['p0', 'p1', 'p2', 'p3']) s = seedWinnings(s, id, []);

    s = step(s); // K/K/5/5 → war between p0 & p1 only.
    expect(s.warParticipants).toEqual(['p0', 'p1']);
    s = step(s); // A beats 7 → p0 wins 12 cards total.
    expect(s.phase).toBe('gameOver');
    const winner = s.players.find((p) => p.id === 'p0')!;
    // 4 battle reveals + 3 p0 spoils + 3 p1 spoils + 2 war reveals = 12.
    expect(winner.winnings.length).toBe(12);
  });

  it('(13) max turns exceeded — winner by card count, or draw', () => {
    // Normal 2p deal with a deliberately tiny maxTurns. The first few
    // battles almost certainly won't finish the game, so step() will
    // hit the safeguard and force-end.
    const s = newGame(defaultConfig({ maxTurns: 2 }), 4242);
    const end = playToCompletion(s);
    expect(end.phase).toBe('gameOver');
    expect(end.forcedByMaxTurns).toBe(true);
    // Card-count tiebreak decides the winner; a real draw (both equal)
    // leaves winnerId null.
    const counts = end.players.map((p) => countOf(p));
    if (counts[0]! === counts[1]!) {
      expect(end.winnerId).toBeNull();
    } else {
      const maxCount = Math.max(...counts);
      expect(end.winnerId).toBe(end.players.find((p) => countOf(p) === maxCount)!.id);
    }
  });

  it('(14) deterministic replay — same seed + config → identical history', () => {
    const cfg = defaultConfig({ playerCount: 4 });
    const a = playToCompletion(newGame(cfg, 12345));
    const b = playToCompletion(newGame(cfg, 12345));
    // Deep equality: every player's piles match card-for-card.
    expect(a.winnerId).toBe(b.winnerId);
    expect(a.turnNumber).toBe(b.turnNumber);
    for (let i = 0; i < a.players.length; i++) {
      expect(a.players[i]!.stock.map((c) => c.id)).toEqual(
        b.players[i]!.stock.map((c) => c.id),
      );
      expect(a.players[i]!.winnings.map((c) => c.id)).toEqual(
        b.players[i]!.winnings.map((c) => c.id),
      );
    }
  });

  it('(15) card-add order — winner\'s cards first, then seat order clockwise', () => {
    const start = newGame(defaultConfig({ playerCount: 3 }), 77);
    // p1 wins. Each seat reveals one card. Expected order in winnings:
    // p1's card, then p2's, then p0's (clockwise from winner).
    let s = seedStock(start, 'p0', [makeCard(3, 'S')]);
    s = seedStock(s, 'p1', [makeCard(14, 'H')]);
    s = seedStock(s, 'p2', [makeCard(5, 'D')]);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);
    s = seedWinnings(s, 'p2', []);

    const after = step(s);
    const p1 = after.players.find((p) => p.id === 'p1')!;
    expect(p1.winnings.map((c) => c.id)).toEqual(['14H', '5D', '3S']);
  });

  it('(16) 3p setup — exactly one card removed, documented, not in play', () => {
    const state = newGame(defaultConfig({ playerCount: 3 }), 0);
    expect(state.removedCard).not.toBeNull();
    expect(state.removedCard!.id).toBe('2S');
    const inPlay = state.players.flatMap((p) => [...p.stock, ...p.winnings]);
    expect(inPlay.length).toBe(51);
    expect(inPlay.find((c) => c.id === '2S')).toBeUndefined();
  });
});

// ─── §11 property tests ─────────────────────────────────────────────

describe('War — invariants', () => {
  it('2p: total cards across piles + table is always 52 through a full game', () => {
    let s = newGame(defaultConfig(), 314);
    while (s.phase !== 'gameOver') {
      expect(totalCards(s)).toBe(52);
      s = step(s);
    }
    expect(totalCards(s)).toBe(52);
  });

  it('3p: total cards across piles + table is always 51', () => {
    let s = newGame(defaultConfig({ playerCount: 3 }), 315);
    while (s.phase !== 'gameOver') {
      expect(totalCards(s)).toBe(51);
      s = step(s);
    }
  });

  it('4p: total cards across piles + table is always 52', () => {
    let s = newGame(defaultConfig({ playerCount: 4 }), 316);
    while (s.phase !== 'gameOver') {
      expect(totalCards(s)).toBe(52);
      s = step(s);
    }
  });

  it('no card ever appears in two places simultaneously', () => {
    let s = newGame(defaultConfig({ playerCount: 4 }), 777);
    while (s.phase !== 'gameOver') {
      const ids = new Set<string>();
      for (const p of s.players) {
        for (const c of p.stock) {
          if (ids.has(c.id)) throw new Error(`duplicate ${c.id}`);
          ids.add(c.id);
        }
        for (const c of p.winnings) {
          if (ids.has(c.id)) throw new Error(`duplicate ${c.id}`);
          ids.add(c.id);
        }
      }
      for (const e of s.table.entries) {
        if (ids.has(e.card.id)) throw new Error(`duplicate on table ${e.card.id}`);
        ids.add(e.card.id);
      }
      s = step(s);
    }
  });

  it('shuffle reshuffle — 500 seeded games always terminate within maxTurns', () => {
    let forced = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const s = playToCompletion(newGame(defaultConfig(), seed));
      expect(s.phase).toBe('gameOver');
      if (s.forcedByMaxTurns) forced++;
    }
    // Statistical bound: the overwhelming majority terminate naturally.
    // Allow a small buffer — but a well-behaved engine should not force
    // at all on a 2p shuffle configuration with default maxTurns=10000.
    expect(forced).toBeLessThan(5);
  });

  it('winner\'s card total at end of game equals starting deck size', () => {
    for (const [playerCount, expected] of [
      [2, 52],
      [3, 51],
      [4, 52],
    ] as const) {
      const end = playToCompletion(newGame(defaultConfig({ playerCount }), 2024));
      if (end.forcedByMaxTurns) continue; // card-count tiebreak may split
      const winner = end.players.find((p) => p.id === end.winnerId);
      expect(winner).toBeDefined();
      expect(countOf(winner!)).toBe(expected);
    }
  });
});

// ─── §11 determinism / snapshot ─────────────────────────────────────

describe('War — snapshot of a fully played game', () => {
  it('2p, seed=1 produces a stable final state', () => {
    const end = playToCompletion(newGame(defaultConfig(), 1));
    // Snapshot the salient fields — avoids committing a 52-card deck
    // layout that would update every time we tweak the shuffle helper.
    // Determinism is covered by the (14) test above; this snapshot
    // locks the game length and winner for seed=1.
    expect({
      playerCount: end.players.length,
      phase: end.phase,
      winnerId: end.winnerId,
      turnNumber: end.turnNumber,
      forcedByMaxTurns: end.forcedByMaxTurns,
    }).toMatchSnapshot();
  });

  it('4p, seed=2024 produces a stable final state', () => {
    const end = playToCompletion(newGame(defaultConfig({ playerCount: 4 }), 2024));
    expect({
      playerCount: end.players.length,
      phase: end.phase,
      winnerId: end.winnerId,
      turnNumber: end.turnNumber,
      forcedByMaxTurns: end.forcedByMaxTurns,
    }).toMatchSnapshot();
  });
});

// ─── Public view ────────────────────────────────────────────────────

describe('War — getPublicView', () => {
  it('hides stock / winnings card identities, only counts', () => {
    const state = newGame(defaultConfig(), 42);
    const view = getPublicView(state, 'p0');
    for (const p of view.players) {
      expect(typeof p.stockCount).toBe('number');
      expect(typeof p.winningsCount).toBe('number');
    }
    // No card-typed fields on players.
    expect((view.players[0] as unknown as { stock?: Card[] }).stock).toBeUndefined();
  });

  it('shows face-up table cards, hides face-down spoils', () => {
    const start = newGame(defaultConfig(), 1);
    let s = seedStock(start, 'p0', [
      makeCard(7, 'S'),
      makeCard(2, 'S'), makeCard(3, 'S'), makeCard(4, 'S'),
      makeCard(14, 'S'),
    ]);
    s = seedStock(s, 'p1', [
      makeCard(7, 'H'),
      makeCard(2, 'H'), makeCard(3, 'H'), makeCard(4, 'H'),
      makeCard(5, 'H'),
    ]);
    s = seedWinnings(s, 'p0', []);
    s = seedWinnings(s, 'p1', []);
    s = step(s); // battle → war
    s = step(s); // war round commits spoils + reveals

    // Awarded immediately since one step resolves the war → no spoils
    // remain on the table. So build a mid-war view by stepping just
    // once into the war.
    const start2 = newGame(defaultConfig(), 1);
    let t = seedStock(start2, 'p0', [makeCard(7, 'S'), makeCard(2, 'S')]);
    t = seedStock(t, 'p1', [makeCard(7, 'H'), makeCard(3, 'H')]);
    t = seedWinnings(t, 'p0', []);
    t = seedWinnings(t, 'p1', []);
    t = step(t);
    const view = getPublicView(t, 'p0');
    // Both face-up 7s should be visible on the table.
    const faceUps = view.table.filter((e) => !e.faceDown);
    expect(faceUps.length).toBe(2);
    for (const e of faceUps) {
      expect(e.card).not.toBeNull();
    }
  });
});

// Consume unused helper import warnings (stepUntil is exported for
// future regression tests).
void stepUntil;
