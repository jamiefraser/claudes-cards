/**
 * cribbageScore — client-side scoring breakdown for "the show".
 *
 * The engine returns a single integer per hand. The UI wants to narrate the
 * count ("15 2, 15 4, and a run of 3 is 7"), so we recompute the breakdown
 * here from the same hand + starter the engine sees. Numbers always agree
 * with engine.scoreHand because both walk the same Hoyle rules.
 */
import type { Card } from '@shared/cards';

export type ScoreEntryKind = '15' | 'pair' | 'run' | 'flush' | 'nobs';

export interface ScoreEntry {
  kind: ScoreEntryKind;
  points: number;
  /** Cards involved in this scoring combination (subset of hand+starter). */
  cards: Card[];
  /** Short human label, e.g. "Fifteen", "Pair", "Run of 3", "Flush", "Nobs". */
  label: string;
}

export interface ScoreBreakdown {
  entries: ScoreEntry[];
  total: number;
  /** Cumulative running narration: ["15 2", "15 4", "and a run of 3 is 7"]. */
  narration: string[];
}

const RANK_ORDER: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function value(card: Card): number {
  if (!card.rank) return 0;
  if (card.rank === 'A') return 1;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return parseInt(card.rank, 10);
}

function order(card: Card): number {
  return RANK_ORDER[card.rank ?? ''] ?? 0;
}

/** Sort a hand ascending by rank, A=1 … K=13. Stable on suits as a tiebreaker. */
export function sortByRank(cards: Card[]): Card[] {
  const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  return [...cards].sort((a, b) => {
    const d = order(a) - order(b);
    if (d !== 0) return d;
    return (SUIT_ORDER[a.suit ?? ''] ?? 9) - (SUIT_ORDER[b.suit ?? ''] ?? 9);
  });
}

function subsetsOfSize(n: number, size: number): number[][] {
  // Returns arrays of indices [0..n-1] with `size` elements each.
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === size) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) {
      acc.push(i);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

function fifteenEntries(cards: Card[]): ScoreEntry[] {
  const out: ScoreEntry[] = [];
  for (let size = 2; size <= cards.length; size++) {
    for (const idxs of subsetsOfSize(cards.length, size)) {
      const sum = idxs.reduce((s, i) => s + value(cards[i]!), 0);
      if (sum === 15) {
        out.push({
          kind: '15',
          points: 2,
          cards: idxs.map((i) => cards[i]!),
          label: 'Fifteen',
        });
      }
    }
  }
  return out;
}

function pairEntries(cards: Card[]): ScoreEntry[] {
  const out: ScoreEntry[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i]!.rank === cards[j]!.rank) {
        out.push({
          kind: 'pair',
          points: 2,
          cards: [cards[i]!, cards[j]!],
          label: 'Pair',
        });
      }
    }
  }
  return out;
}

function runEntries(cards: Card[]): ScoreEntry[] {
  // Find the longest run length present (≥3), then enumerate every distinct
  // subset of that length whose ranks are consecutive — duplicates expand into
  // multiple runs (a double run of 3 is two runs of 3, etc.).
  const n = cards.length;
  let best = 0;
  for (let size = 3; size <= n; size++) {
    for (const idxs of subsetsOfSize(n, size)) {
      const ranks = idxs.map((i) => order(cards[i]!)).sort((a, b) => a - b);
      let ok = true;
      for (let k = 1; k < ranks.length; k++) {
        if (ranks[k] !== ranks[k - 1]! + 1) { ok = false; break; }
      }
      if (ok && size > best) best = size;
    }
  }
  if (best < 3) return [];

  const out: ScoreEntry[] = [];
  for (const idxs of subsetsOfSize(n, best)) {
    const subset = idxs.map((i) => cards[i]!);
    const ranks = subset.map(order).sort((a, b) => a - b);
    let ok = true;
    for (let k = 1; k < ranks.length; k++) {
      if (ranks[k] !== ranks[k - 1]! + 1) { ok = false; break; }
    }
    if (ok) {
      out.push({
        kind: 'run',
        points: best,
        cards: sortByRank(subset),
        label: `Run of ${best}`,
      });
    }
  }
  return out;
}

function flushEntry(hand: Card[], cutCard: Card | null, isCrib: boolean): ScoreEntry | null {
  if (hand.length < 4) return null;
  const suit = hand[0]!.suit;
  if (!hand.every((c) => c.suit === suit)) return null;
  if (cutCard && cutCard.suit === suit) {
    return {
      kind: 'flush',
      points: 5,
      cards: [...hand, cutCard],
      label: 'Flush of 5',
    };
  }
  if (isCrib) return null; // crib flush requires the starter
  return {
    kind: 'flush',
    points: 4,
    cards: [...hand],
    label: 'Flush of 4',
  };
}

function nobsEntry(hand: Card[], cutCard: Card | null): ScoreEntry | null {
  if (!cutCard) return null;
  const jack = hand.find((c) => c.rank === 'J' && c.suit === cutCard.suit);
  if (!jack) return null;
  return {
    kind: 'nobs',
    points: 1,
    cards: [jack],
    label: 'Nobs',
  };
}

/**
 * Compute the full scoring breakdown for a 4-card hand + starter.
 * For the crib, pass isCrib=true (only changes flush rules).
 */
export function computeBreakdown(
  hand: Card[],
  cutCard: Card | null,
  isCrib = false,
): ScoreBreakdown {
  const cards = cutCard ? [...hand, cutCard] : [...hand];

  const entries: ScoreEntry[] = [
    ...fifteenEntries(cards),
    ...pairEntries(cards),
    ...runEntries(cards),
  ];
  const flush = flushEntry(hand, cutCard, isCrib);
  if (flush) entries.push(flush);
  const nobs = nobsEntry(hand, cutCard);
  if (nobs) entries.push(nobs);

  const total = entries.reduce((s, e) => s + e.points, 0);

  // Build the spoken narration cribbage players say at the table.
  // 15s collapse into "15 2, 15 4, …"; the rest are added with running totals.
  const narration: string[] = [];
  let running = 0;
  let fifteenCount = 0;
  for (const e of entries) {
    running += e.points;
    if (e.kind === '15') {
      fifteenCount++;
      narration.push(`15 ${running}`);
    } else {
      const article = /^[aeiou]/i.test(e.label) ? 'an' : 'a';
      narration.push(
        narration.length === 0
          ? `${e.label} for ${running}`
          : `${article} ${e.label.toLowerCase()} is ${running}`,
      );
    }
  }
  if (entries.length === 0) narration.push('Nineteen — no points');
  void fifteenCount; // reserved for future styling

  return { entries, total, narration };
}
