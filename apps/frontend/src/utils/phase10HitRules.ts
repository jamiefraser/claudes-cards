/**
 * Phase 10 hit-meld validation — CLIENT SIDE.
 *
 * Mirrors the engine-side `canHitMeld` in
 * `apps/socket-service/src/games/phase10/engine.ts`. We duplicate the
 * logic instead of importing across the service boundary so the lobby
 * UI can pre-filter hit targets before submitting. The engine is still
 * the source of truth — if these ever disagree, the engine wins and the
 * user sees a game_error.
 *
 * Rules:
 *   - Skip cards cannot hit any meld.
 *   - Wild cards hit any meld (runs: must have room within 1..12).
 *   - Set   hit: value must match the set's rank (or be wild).
 *   - Run   hit: the new card must not duplicate an existing value AND
 *                after adding, the span-minus-card-count must be
 *                coverable by existing wilds.
 *   - Colour hit: colour must match the meld's colour.
 *
 * If the mirror ever gets stale, add tests under
 * `apps/frontend/__tests__/phase10HitRules.test.ts`.
 */
import type { Card } from '@shared/cards';

export type MeldType = 'set' | 'run' | 'color';

export function canPhase10HitMeld(
  card: Card,
  meldType: MeldType,
  existing: Card[],
): boolean {
  if (card.phase10Type === 'skip') return false;
  if (existing.length === 0) {
    return card.phase10Type === 'wild' || card.phase10Type === 'number';
  }
  switch (meldType) {
    case 'set':   return canHitSet(card, existing);
    case 'run':   return canHitRun(card, existing);
    case 'color': return canHitColor(card, existing);
    default:      return false;
  }
}

function canHitSet(card: Card, existing: Card[]): boolean {
  if (card.phase10Type === 'wild') return true;
  if (card.phase10Type !== 'number') return false;
  const nonWilds = existing.filter((c) => c.phase10Type === 'number');
  if (nonWilds.length === 0) return true;
  return nonWilds[0]!.value === card.value;
}

function canHitColor(card: Card, existing: Card[]): boolean {
  if (card.phase10Type === 'wild') return true;
  if (card.phase10Type !== 'number') return false;
  const nonWilds = existing.filter((c) => c.phase10Type === 'number');
  if (nonWilds.length === 0) return true;
  return nonWilds[0]!.phase10Color === card.phase10Color;
}

function canHitRun(card: Card, existing: Card[]): boolean {
  if (card.phase10Type === 'wild') {
    const nonWilds = existing.filter((c) => c.phase10Type === 'number');
    if (nonWilds.length === 0) return true;
    const values = nonWilds.map((c) => c.value);
    return Math.min(...values) > 1 || Math.max(...values) < 12;
  }
  if (card.phase10Type !== 'number') return false;
  if (card.value < 1 || card.value > 12) return false;

  const nonWilds = existing.filter((c) => c.phase10Type === 'number');
  const totalWilds = existing.length - nonWilds.length;
  if (nonWilds.length === 0) return true;

  const values = nonWilds.map((c) => c.value);
  if (values.includes(card.value)) return false;

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const newMin = Math.min(minV, card.value);
  const newMax = Math.max(maxV, card.value);
  const newSpan = newMax - newMin + 1;
  const newNonWildCount = values.length + 1;
  const neededGaps = newSpan - newNonWildCount;
  return neededGaps >= 0 && neededGaps <= totalWilds;
}
