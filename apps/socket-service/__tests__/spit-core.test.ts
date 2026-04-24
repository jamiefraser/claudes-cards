/**
 * Spit — pure core tests. Covers §10 edge cases + concurrency + replay.
 */

import {
  newGame,
  start,
  applyAction,
  legalPlays,
  isStuck,
  isBothStuck,
  canPlayOn,
  replay,
  buildLayout,
  getPublicView,
  DEFAULT_CONFIG,
  type Card,
  type GameState,
  type SpitConfig,
  type Rank,
  type Suit,
  type Action,
} from '../src/games/spit/core';

let cardCounter = 0;
function mkCard(rank: Rank, suit: Suit = 'S', suffix = ''): Card {
  return { rank, suit, id: `${rank}${suit}${suffix}${cardCounter++}` };
}

function rigged(
  p1Columns: Card[][],
  p2Columns: Card[][],
  centers: [Card[], Card[]],
  opts: {
    p1Spit?: Card[];
    p2Spit?: Card[];
    config?: Partial<SpitConfig>;
  } = {},
): GameState {
  const base = newGame(['A', 'B'], opts.config, 1);
  return {
    ...base,
    players: [
      { id: 'A', columns: p1Columns, spitPile: opts.p1Spit ?? [], outOfMatch: false },
      { id: 'B', columns: p2Columns, spitPile: opts.p2Spit ?? [], outOfMatch: false },
    ],
    centerPiles: centers,
    phase: 'playing',
    spitAvailable: false,
  };
}

function totalCards(state: GameState): number {
  return state.players.reduce(
    (s, p) => s + p.columns.reduce((a, c) => a + c.length, 0) + p.spitPile.length,
    0,
  ) + state.centerPiles[0].length + state.centerPiles[1].length;
}

// ─── Setup §10.1, buildLayout ──────────────────────────────────────

describe('Spit — setup', () => {
  it('newGame deals 15 cards into a 1-2-3-4-5 pyramid + 11-card spit pile (1)', () => {
    const state = newGame(['A', 'B'], {}, 42);
    for (const p of state.players) {
      expect(p.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5]);
      expect(p.spitPile).toHaveLength(11);
    }
    expect(totalCards(state)).toBe(52);
  });

  it('rejects != 2 players', () => {
    expect(() => newGame(['A'], {}, 1)).toThrow();
    expect(() => newGame(['A', 'B', 'C'], {}, 1)).toThrow();
  });

  it('start flips both spit-pile tops into the centres', () => {
    const base = newGame(['A', 'B'], {}, 42);
    const after = start(base);
    expect(after.phase).toBe('playing');
    expect(after.centerPiles[0]).toHaveLength(1);
    expect(after.centerPiles[1]).toHaveLength(1);
    expect(after.players[0].spitPile).toHaveLength(10);
    expect(after.players[1].spitPile).toHaveLength(10);
    expect(totalCards(after)).toBe(52);
  });

  it('buildLayout handles decks smaller than 15', () => {
    // Partial layout: 10 cards → columns [1,2,3,4], 0 spit pile
    const deck = Array.from({ length: 10 }, (_, i) => mkCard('5', 'S', `${i}`));
    const layout = buildLayout(deck);
    expect(layout.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 0]);
    expect(layout.spitPile).toHaveLength(0);
  });
});

// ─── Play + adjacency §10.2-8 ──────────────────────────────────────

describe('Spit — play legality', () => {
  it('rank-up on centre is legal (2)', () => {
    expect(canPlayOn(mkCard('6'), mkCard('5'), DEFAULT_CONFIG)).toBe(true);
  });
  it('rank-down on centre is legal (3)', () => {
    expect(canPlayOn(mkCard('4'), mkCard('5'), DEFAULT_CONFIG)).toBe(true);
  });
  it('A on 2 with wrap on (4)', () => {
    expect(canPlayOn(mkCard('A'), mkCard('2'), DEFAULT_CONFIG)).toBe(true);
  });
  it('A on K with wrap on (5)', () => {
    expect(canPlayOn(mkCard('A'), mkCard('K'), DEFAULT_CONFIG)).toBe(true);
  });
  it('A on K rejected when wrap off (6)', () => {
    expect(canPlayOn(mkCard('A'), mkCard('K'), { ...DEFAULT_CONFIG, wrapRanks: false })).toBe(false);
  });
  it('non-adjacent rejected', () => {
    expect(canPlayOn(mkCard('7'), mkCard('5'), DEFAULT_CONFIG)).toBe(false);
  });

  it('applying a play exposes the next column top (7)', () => {
    // Column 1 of A: [5, 6] (top = 6). Centre 0: 5. Play 6 onto centre.
    const state = rigged(
      [[], [mkCard('5', 'H', 'a'), mkCard('6')], [], [], []],
      [[mkCard('10')], [], [], [], []],
      [[mkCard('5')], [mkCard('10')]],
    );
    const after = applyAction(state, {
      kind: 'play', playerId: 'A', columnIndex: 1, centerIndex: 0,
    }, 1);
    expect(after.players[0].columns[1]).toHaveLength(1);
    expect(after.centerPiles[0]).toHaveLength(2);
    expect(totalCards(after)).toBe(totalCards(state));
  });

  it('playing the last card of a column leaves it empty (8)', () => {
    const state = rigged(
      [[mkCard('6')], [], [], [], []],
      [[mkCard('10')], [], [], [], []],
      [[mkCard('5')], [mkCard('Q')]],
    );
    const after = applyAction(state, {
      kind: 'play', playerId: 'A', columnIndex: 0, centerIndex: 0,
    }, 1);
    expect(after.players[0].columns[0]).toHaveLength(0);
  });

  it('playing from an empty column is rejected (28)', () => {
    const state = rigged(
      [[], [], [], [], []],
      [[mkCard('5')], [], [], [], []],
      [[mkCard('A')], [mkCard('Q')]],
    );
    const after = applyAction(state, {
      kind: 'play', playerId: 'A', columnIndex: 0, centerIndex: 0,
    }, 1);
    // The applyAction wrapper catches + records the rejection.
    expect(after.actionLog[after.actionLog.length - 1]!.resolution).toBe('rejected');
    expect(after.players).toEqual(state.players);
  });

  it('invalid columnIndex rejected (27)', () => {
    const state = rigged(
      [[mkCard('6')], [], [], [], []],
      [[mkCard('10')], [], [], [], []],
      [[mkCard('5')], [mkCard('Q')]],
    );
    const after = applyAction(state, {
      kind: 'play', playerId: 'A',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columnIndex: 6 as any, centerIndex: 0,
    }, 1);
    expect(after.actionLog[after.actionLog.length - 1]!.resolution).toBe('rejected');
  });

  it('wrong-player rejected (26)', () => {
    const state = rigged(
      [[mkCard('6')], [], [], [], []],
      [[mkCard('10')], [], [], [], []],
      [[mkCard('5')], [mkCard('Q')]],
    );
    const after = applyAction(state, {
      kind: 'play', playerId: 'not-a-player',
      columnIndex: 0, centerIndex: 0,
    }, 1);
    expect(after.actionLog[after.actionLog.length - 1]!.resolution).toBe('rejected');
  });
});

// ─── Stuck detection + spit §10.9-13 ───────────────────────────────

describe('Spit — stuck + spit action', () => {
  it('both players stuck → spitAvailable true (9)', () => {
    // A's only top = 7; B's only top = 9; centres = [2, 5]. Nobody can play.
    const state = rigged(
      [[mkCard('7')], [], [], [], []],
      [[mkCard('9')], [], [], [], []],
      [[mkCard('2')], [mkCard('5')]],
      { p1Spit: [mkCard('J', 'S', 'a')], p2Spit: [mkCard('3', 'S', 'b')] },
    );
    expect(isStuck(state, 'A')).toBe(true);
    expect(isStuck(state, 'B')).toBe(true);
    expect(isBothStuck(state)).toBe(true);
  });

  it('spit rejected when only one player stuck (10)', () => {
    // A stuck (has a 7; centre is 2). B can play 6 on 5.
    const state = rigged(
      [[mkCard('7')], [], [], [], []],
      [[mkCard('6')], [], [], [], []],
      [[mkCard('2')], [mkCard('5')]],
      { p1Spit: [mkCard('3', 'S', 'a')], p2Spit: [mkCard('J', 'S', 'b')] },
    );
    const after = applyAction(state, { kind: 'spit', playerId: 'A' }, 1);
    expect(after.actionLog[after.actionLog.length - 1]!.resolution).toBe('rejected');
  });

  it('both stuck + non-empty spit piles → flip one from each (11)', () => {
    const p1Spit = [mkCard('J', 'S', 'a')];
    const p2Spit = [mkCard('3', 'S', 'b')];
    const state = rigged(
      [[mkCard('7')], [], [], [], []],
      [[mkCard('9')], [], [], [], []],
      [[mkCard('2')], [mkCard('5')]],
      { p1Spit, p2Spit },
    );
    const after = applyAction(state, { kind: 'spit', playerId: 'A' }, 1);
    expect(after.centerPiles[0]).toHaveLength(2);
    expect(after.centerPiles[1]).toHaveLength(2);
    expect(after.players[0].spitPile).toHaveLength(0);
    expect(after.players[1].spitPile).toHaveLength(0);
  });

  it('stalemate with both empty spit piles + unequal columns → shorter wins (13)', () => {
    // A has 1 stock card; B has 3. Both stuck. Both spit piles empty.
    const state = rigged(
      [[mkCard('7')], [], [], [], []],
      [[mkCard('9'), mkCard('J'), mkCard('K')], [], [], [], []],
      [[mkCard('2')], [mkCard('5')]],
    );
    // Manually force both-stuck to reach spit.
    const after = applyAction(state, { kind: 'spit', playerId: 'A' }, 1);
    expect(after.phase).toBe('roundOver');
    expect(after.roundWinnerId).toBe('A'); // A has fewer stock cards
  });
});

// ─── Slap + round end §10.14-17 ────────────────────────────────────

describe('Spit — slap + round end', () => {
  it('player who empties all columns can slap (14, 15)', () => {
    // A's columns all empty. Centres = [[5], [A]]. A slaps centre 0.
    const state = rigged(
      [[], [], [], [], []],
      [[mkCard('5')], [], [], [], []],
      [[mkCard('5')], [mkCard('A')]],
      { p1Spit: [mkCard('3', 'S', 'a')], p2Spit: [mkCard('Q', 'S', 'b')] },
    );
    const after = applyAction(state, {
      kind: 'slap', playerId: 'A', centerIndex: 0,
    }, 1);
    expect(after.phase === 'roundOver' || after.phase === 'matchOver').toBe(true);
    expect(after.roundWinnerId).toBe('A');
  });

  it('slap before emptying columns is rejected (16)', () => {
    const state = rigged(
      [[mkCard('5')], [], [], [], []],
      [[mkCard('6')], [], [], [], []],
      [[mkCard('A')], [mkCard('Q')]],
    );
    const after = applyAction(state, {
      kind: 'slap', playerId: 'A', centerIndex: 0,
    }, 1);
    expect(after.actionLog[after.actionLog.length - 1]!.resolution).toBe('rejected');
  });

  it('winner takes slapped pile, loser takes the other (21, 22)', () => {
    const state = rigged(
      [[], [], [], [], []],
      [[mkCard('5', 'H'), mkCard('7', 'H')], [], [], [], []],
      [[mkCard('A', 'H'), mkCard('2', 'H')], [mkCard('K', 'H'), mkCard('Q', 'H'), mkCard('J', 'H')]],
      { p1Spit: [mkCard('3', 'S', 'a')], p2Spit: [mkCard('6', 'S', 'b')] },
    );
    const after = applyAction(state, {
      kind: 'slap', playerId: 'A', centerIndex: 0, // smaller pile
    }, 1);
    // A's new deck = centre 0 (2 cards) + A's spit (1 card) = 3 cards.
    // B's new deck = centre 1 (3 cards) + B's spit (1) + B's columns (2) = 6 cards.
    const aCards =
      after.players[0].columns.reduce((s, c) => s + c.length, 0) + after.players[0].spitPile.length;
    const bCards =
      after.players[1].columns.reduce((s, c) => s + c.length, 0) + after.players[1].spitPile.length;
    expect(aCards).toBe(3);
    expect(bCards).toBe(6);
  });

  it('loser whose new deck is empty loses the match (24)', () => {
    // Contrived: loser has no columns + no spit + no centre → new deck 0.
    const state = rigged(
      [[], [], [], [], []],
      [[], [], [], [], []],
      [[mkCard('5'), mkCard('6'), mkCard('7')], []],
      { p1Spit: [mkCard('A', 'S', 'a')], p2Spit: [] },
    );
    // A slaps the bigger centre 0 (3 cards); B gets empty centre 1 + empty spit + empty columns.
    const after = applyAction(state, {
      kind: 'slap', playerId: 'A', centerIndex: 0,
    }, 1);
    expect(after.phase).toBe('matchOver');
    expect(after.matchWinnerId).toBe('A');
  });
});

// ─── Concurrency §10.18-20 ─────────────────────────────────────────

describe('Spit — concurrency resolution', () => {
  it('two plays to the same centre: first wins, second rejected (18)', () => {
    // Both A and B can play 6 onto centre 0 (top = 5).
    const state = rigged(
      [[mkCard('6', 'H', 'a')], [], [], [], []],
      [[mkCard('6', 'D', 'b')], [], [], [], []],
      [[mkCard('5')], [mkCard('Q')]],
    );
    let s = applyAction(state, {
      kind: 'play', playerId: 'A', columnIndex: 0, centerIndex: 0,
    }, 1);
    expect(s.actionLog[s.actionLog.length - 1]!.resolution).toBe('accepted');
    // Centre 0 top is now 6H. B's 6D is no longer adjacent to 6H.
    s = applyAction(s, {
      kind: 'play', playerId: 'B', columnIndex: 0, centerIndex: 0,
    }, 2);
    expect(s.actionLog[s.actionLog.length - 1]!.resolution).toBe('rejected');
  });

  it('two plays to different centres both accepted (19)', () => {
    const state = rigged(
      [[mkCard('6', 'H', 'a')], [], [], [], []],
      [[mkCard('J', 'D', 'b')], [], [], [], []],
      [[mkCard('5')], [mkCard('10')]],
    );
    let s = applyAction(state, {
      kind: 'play', playerId: 'A', columnIndex: 0, centerIndex: 0,
    }, 1);
    expect(s.actionLog[s.actionLog.length - 1]!.resolution).toBe('accepted');
    s = applyAction(s, {
      kind: 'play', playerId: 'B', columnIndex: 0, centerIndex: 1,
    }, 2);
    expect(s.actionLog[s.actionLog.length - 1]!.resolution).toBe('accepted');
  });
});

// ─── Determinism replay §10.25 ─────────────────────────────────────

describe('Spit — replay determinism', () => {
  it('same seed + same action log → identical state (25)', () => {
    const cfg = { wrapRanks: true };
    const s1 = newGame(['A', 'B'], cfg, 42);
    const s2 = newGame(['A', 'B'], cfg, 42);
    // Compare full layouts.
    for (let i = 0; i < 2; i++) {
      for (let c = 0; c < 5; c++) {
        expect(s1.players[i]!.columns[c]!.map((x) => x.id))
          .toEqual(s2.players[i]!.columns[c]!.map((x) => x.id));
      }
    }
    // Replay with an empty log — state is just initial.
    const replayed = replay(['A', 'B'], cfg, 42, []);
    expect(replayed.players[0].columns.map((c) => c.length))
      .toEqual(s1.players[0].columns.map((c) => c.length));
  });

  it('replay applies actions in order and matches direct application', () => {
    const cfg = { wrapRanks: true };
    const log: Array<{ action: Action; timestamp: number }> = [
      { action: { kind: 'start' }, timestamp: 0 },
    ];
    const direct = applyAction(newGame(['A', 'B'], cfg, 42), { kind: 'start' }, 0);
    const replayed = replay(['A', 'B'], cfg, 42, log);
    expect(replayed.players[0].spitPile.length).toBe(direct.players[0].spitPile.length);
    expect(replayed.centerPiles[0].length).toBe(direct.centerPiles[0].length);
  });
});

// ─── Invariants ────────────────────────────────────────────────────

describe('Spit — invariants', () => {
  it('card count is 52 across all zones throughout play', () => {
    let state = newGame(['A', 'B'], {}, 7);
    expect(totalCards(state)).toBe(52);
    state = start(state);
    expect(totalCards(state)).toBe(52);
    // Play 20 random legal actions (best-effort — may be rejected).
    for (let i = 0; i < 20; i++) {
      const playerId = i % 2 === 0 ? 'A' : 'B';
      const legal = legalPlays(state, playerId);
      if (legal.length === 0) continue;
      const pick = legal[i % legal.length]!;
      state = applyAction(state, pick, i + 1);
      expect(totalCards(state)).toBe(52);
    }
  });
});

// ─── Public view ───────────────────────────────────────────────────

describe('Spit — public view', () => {
  it('exposes column tops, depths, spit-pile counts, centre tops', () => {
    const state = start(newGame(['A', 'B'], {}, 42));
    const view = getPublicView(state, 'A');
    expect(view.players).toHaveLength(2);
    expect(view.players[0]!.columnDepths).toEqual([1, 2, 3, 4, 5]);
    expect(view.players[0]!.spitPileCount).toBe(10); // 11 - 1 flipped
    expect(view.centerTops[0]).not.toBeNull();
    expect(view.centerTops[1]).not.toBeNull();
  });
});

// ─── Snapshot ──────────────────────────────────────────────────────

describe('Spit — snapshot', () => {
  it('seeded initial deal is stable', () => {
    const state = newGame(['A', 'B'], {}, 42);
    const shape = {
      p1: {
        cols: state.players[0].columns.map((c) => c.map((x) => `${x.rank}${x.suit}`)),
        spitCount: state.players[0].spitPile.length,
      },
      p2: {
        cols: state.players[1].columns.map((c) => c.map((x) => `${x.rank}${x.suit}`)),
        spitCount: state.players[1].spitPile.length,
      },
    };
    expect(shape).toMatchSnapshot();
  });
});
