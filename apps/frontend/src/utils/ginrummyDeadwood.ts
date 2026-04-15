import type { Card } from '@shared/cards';

// Source of truth: apps/socket-service/src/games/ginrummy/engine.ts (computeDeadwood).
// Mirrored here so the table UI can light up Knock/Gin without a server round-trip.
// Keep in sync if the engine's meld rules change.

const RANK_ORDER: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function rankVal(rank: string): number {
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function cardPt(c: Card): number {
  return rankVal(c.rank ?? 'A');
}

export function computeDeadwood(hand: readonly Card[]): number {
  if (hand.length === 0) return 0;
  const total = hand.reduce((s, c) => s + cardPt(c), 0);

  const candidates: number[][] = [];

  const byRank: Record<string, number[]> = {};
  hand.forEach((c, i) => {
    const r = c.rank ?? '';
    byRank[r] = byRank[r] ?? [];
    byRank[r]!.push(i);
  });
  for (const idxs of Object.values(byRank)) {
    if (idxs.length >= 3) {
      candidates.push([...idxs]);
      if (idxs.length === 4) {
        for (let skip = 0; skip < 4; skip++) {
          candidates.push(idxs.filter((_, j) => j !== skip));
        }
      }
    }
  }

  const bySuit: Record<string, Array<{ idx: number; rank: number }>> = {};
  hand.forEach((c, i) => {
    const s = c.suit ?? '';
    const r = RANK_ORDER[c.rank ?? ''] ?? 0;
    bySuit[s] = bySuit[s] ?? [];
    bySuit[s]!.push({ idx: i, rank: r });
  });
  for (const entries of Object.values(bySuit)) {
    const sorted = [...entries].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 2; j < sorted.length; j++) {
        let ok = true;
        for (let k = i + 1; k <= j; k++) {
          if (sorted[k]!.rank !== sorted[k - 1]!.rank + 1) { ok = false; break; }
        }
        if (ok) {
          candidates.push(sorted.slice(i, j + 1).map((e) => e.idx));
        }
      }
    }
  }

  let minDead = total;
  const dfs = (startIdx: number, used: boolean[], meldedPts: number): void => {
    const deadwood = total - meldedPts;
    if (deadwood < minDead) minDead = deadwood;
    if (startIdx >= candidates.length) return;
    for (let i = startIdx; i < candidates.length; i++) {
      const cand = candidates[i]!;
      if (cand.some((idx) => used[idx])) continue;
      for (const idx of cand) used[idx] = true;
      const pts = cand.reduce((s, idx) => s + cardPt(hand[idx]!), 0);
      dfs(i + 1, used, meldedPts + pts);
      for (const idx of cand) used[idx] = false;
    }
  };
  dfs(0, Array(hand.length).fill(false), 0);

  return minDead;
}

export interface KnockEligibility {
  readonly canKnock: boolean;
  readonly isGin: boolean;
  readonly isBigGin: boolean;
  readonly deadwood: number;
}

export function knockEligibility(hand: readonly Card[]): KnockEligibility {
  const deadwood = computeDeadwood(hand);
  const canKnock = deadwood <= 10;
  const isGin = canKnock && deadwood === 0;
  const isBigGin = isGin && hand.length === 11;
  return { canKnock, isGin, isBigGin, deadwood };
}
