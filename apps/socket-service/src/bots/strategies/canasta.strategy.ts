/**
 * Canasta Bot Strategy
 *
 * Canasta has two sub-phases in a turn — `draw` (must draw from stock or take
 * the discard pile) and `meld-discard` (optional meld(s) followed by a
 * mandatory discard). The generic strategy always returns a bare `draw`,
 * which left the bot stuck in `meld-discard` forever because it never
 * discarded. This strategy drives the turn to completion:
 *
 *   draw phase       → draw from stock
 *   meld-discard     → attempt melds that are legal (respecting the side's
 *                      initial-meld minimum), then discard the highest-value
 *                      card that can't be immediately melded
 *
 * The melding logic is deliberately simple: it groups cards by rank and melds
 * any group of three or more naturals of the same rank. It doesn't chase
 * canastas or time going-out — good enough to make the game progress without
 * being a noticeable threat.
 */

import type {
  IBotStrategy,
  GameState,
  PlayerAction,
  Card,
} from '@card-platform/shared-types';
import { logger } from '../../utils/logger';
import { canastaCardPoints, initialMeldMinimum, isWild } from '../../games/canasta/engine';

interface CanastaPublicData {
  gamePhase?: 'draw' | 'meld-discard' | 'ended' | string;
  variant?: '2p' | '3p' | '4p';
  initialMeldDone?: Record<string, boolean>;
  scoresPriorHand?: Record<string, number>;
  meldKeys?: string[];
}

function sideOf(
  variant: '2p' | '3p' | '4p' | undefined,
  playerIds: string[],
  playerId: string,
): string {
  if (variant === '4p') {
    const idx = playerIds.indexOf(playerId);
    return idx === 0 || idx === 2 ? 'A' : 'B';
  }
  return playerId;
}

function isRedThree(c: Card): boolean {
  return c.rank === '3' && (c.suit === 'hearts' || c.suit === 'diamonds');
}
function isBlackThree(c: Card): boolean {
  return c.rank === '3' && (c.suit === 'clubs' || c.suit === 'spades');
}

export class CanastaBotStrategy implements IBotStrategy {
  readonly gameId = 'canasta';

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decide(state, botPlayerId);
    } catch (err) {
      logger.warn('CanastaBotStrategy: decide failed, using fallback', {
        botPlayerId,
        err: (err as Error).message,
      });
      return this.fallbackAction(state, botPlayerId);
    }
  }

  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const me = state.players.find((p) => p.playerId === botPlayerId);
      if (!me || me.hand.length === 0) return { type: 'pass' };
      const pd = state.publicData as unknown as CanastaPublicData;
      if (pd.gamePhase === 'draw') return { type: 'draw' };
      // Discard the rightmost non-red-3 card we hold.
      const discardable = me.hand.filter((c) => !isRedThree(c));
      const pick = discardable[discardable.length - 1] ?? me.hand[me.hand.length - 1];
      if (!pick) return { type: 'pass' };
      return { type: 'discard', cardIds: [pick.id] };
    } catch {
      return { type: 'pass' };
    }
  }

  private decide(state: GameState, botPlayerId: string): PlayerAction {
    const pd = state.publicData as unknown as CanastaPublicData;

    if (pd.gamePhase === 'draw') return { type: 'draw' };

    if (pd.gamePhase !== 'meld-discard') return { type: 'pass' };

    const me = state.players.find((p) => p.playerId === botPlayerId);
    if (!me || me.hand.length === 0) return { type: 'pass' };

    const playerIds = state.players.map((p) => p.playerId);
    const side = sideOf(pd.variant, playerIds, botPlayerId);
    const alreadyMelded = pd.initialMeldDone?.[side] ?? false;

    // Try to meld: group naturals by rank. Red/black threes never go into
    // regular melds, and 2s are wild (leave them for pile-takes).
    const byRank = new Map<string, Card[]>();
    for (const c of me.hand) {
      if (!c.rank) continue;
      if (c.rank === '3') continue; // red or black — not a regular meld
      if (isWild(c)) continue; // wilds can extend melds but we're only forming new ones
      const list = byRank.get(c.rank) ?? [];
      list.push(c);
      byRank.set(c.rank, list);
    }

    const meldCandidates: Card[][] = [];
    for (const cards of byRank.values()) {
      if (cards.length >= 3) meldCandidates.push(cards);
    }

    if (meldCandidates.length > 0) {
      // If this is the initial meld, make sure the total point value clears
      // the threshold. If not, skip melding for now — better to discard.
      if (!alreadyMelded) {
        const prior = pd.scoresPriorHand?.[side] ?? 0;
        const required = initialMeldMinimum(prior);
        const totalPoints = meldCandidates
          .flat()
          .reduce((sum, c) => sum + canastaCardPoints(c), 0);
        if (totalPoints >= required) {
          // Flatten all candidate groups into one action — the engine
          // accepts them one at a time, so pick the largest group.
          const best = meldCandidates.sort((a, b) => b.length - a.length)[0]!;
          return { type: 'meld', cardIds: best.map((c) => c.id) };
        }
      } else {
        // Already melded — any new group is a legal add.
        const best = meldCandidates.sort((a, b) => b.length - a.length)[0]!;
        return { type: 'meld', cardIds: best.map((c) => c.id) };
      }
    }

    // Discard. Prefer a black 3 (safe), else the highest-value card we can't
    // easily use. Avoid discarding wilds or red 3s (red 3s get auto-promoted
    // by the engine during draw; we shouldn't hold them, but be safe).
    const candidates = me.hand.filter((c) => !isRedThree(c) && !isWild(c));
    if (candidates.length === 0) {
      return { type: 'discard', cardIds: [me.hand[me.hand.length - 1]!.id] };
    }
    const black3 = candidates.find(isBlackThree);
    if (black3) return { type: 'discard', cardIds: [black3.id] };
    // Highest card point-value first; ties broken by rightmost in hand.
    const sorted = [...candidates].sort((a, b) => canastaCardPoints(b) - canastaCardPoints(a));
    return { type: 'discard', cardIds: [sorted[0]!.id] };
  }
}
