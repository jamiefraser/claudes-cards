/**
 * Phase 10 Bot Strategy
 *
 * Priority-ordered rule set per SPEC.md §9.5:
 * 1. If bot can lay down current phase → lay it down
 * 2. If phase already laid and can hit a meld → hit highest-value card legally
 * 3. Draw: prefer discard pile top if it advances phase; otherwise draw from deck
 * 4. Discard: highest point value card NOT part of any potential phase combination
 *
 * Wild cards are never discarded.
 * Skip cards are played immediately when drawn, targeting opponent with most cards.
 * fallbackAction: discard rightmost card (must always succeed).
 */

import type { IBotStrategy, GameState, PlayerAction, Card } from '@card-platform/shared-types';
import {
  canCompletePhase,
  findPhaseArrangement,
  canHitMeld,
} from '../../games/phase10/engine.js';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Internal type for publicData in Phase 10 state
// ---------------------------------------------------------------------------

interface Phase10PublicData {
  discardTop?: Card | null;
  drawPileSize?: number;
  turnPhase?: 'draw' | 'discard' | string;
  skippedPlayers?: string[];
  laidDownPhases?: Record<string, Array<{ type: string; cardIds: string[] }>>;
}

interface PhaseRequirement {
  groups: Array<{ type: 'set' | 'run' | 'color'; count: number }>;
}

const PHASE_REQUIREMENTS: Record<number, PhaseRequirement> = {
  1: { groups: [{ type: 'set', count: 3 }, { type: 'set', count: 3 }] },
  2: { groups: [{ type: 'set', count: 3 }, { type: 'run', count: 4 }] },
  3: { groups: [{ type: 'set', count: 4 }, { type: 'run', count: 4 }] },
  4: { groups: [{ type: 'run', count: 7 }] },
  5: { groups: [{ type: 'run', count: 8 }] },
  6: { groups: [{ type: 'run', count: 9 }] },
  7: { groups: [{ type: 'set', count: 4 }, { type: 'set', count: 4 }] },
  8: { groups: [{ type: 'color', count: 7 }] },
  9: { groups: [{ type: 'set', count: 5 }, { type: 'set', count: 2 }] },
  10: { groups: [{ type: 'set', count: 5 }, { type: 'set', count: 3 }] },
};

function scoreCard(card: Card): number {
  if (card.phase10Type === 'wild') return 25;
  if (card.phase10Type === 'skip') return 15;
  if (card.value >= 10) return 10;
  return card.value;
}

export class Phase10BotStrategy implements IBotStrategy {
  readonly gameId = 'phase10';

  // -------------------------------------------------------------------------
  // chooseAction
  // -------------------------------------------------------------------------

  chooseAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      return this.decideAction(state, botPlayerId);
    } catch (err) {
      logger.warn('Phase10BotStrategy.chooseAction error, using fallback', {
        error: String(err),
        botPlayerId,
      });
      return this.fallbackAction(state, botPlayerId);
    }
  }

  // -------------------------------------------------------------------------
  // fallbackAction — must never throw
  // -------------------------------------------------------------------------

  fallbackAction(state: GameState, botPlayerId: string): PlayerAction {
    try {
      const player = state?.players?.find((p) => p.playerId === botPlayerId);
      if (!player || !player.hand || player.hand.length === 0) {
        return { type: 'pass' };
      }
      const rightmost = player.hand[player.hand.length - 1]!;
      return { type: 'discard', cardIds: [rightmost.id] };
    } catch {
      return { type: 'pass' };
    }
  }

  // -------------------------------------------------------------------------
  // Private: main decision logic
  // -------------------------------------------------------------------------

  private decideAction(state: GameState, botPlayerId: string): PlayerAction {
    const player = state.players.find((p) => p.playerId === botPlayerId);
    if (!player) throw new Error(`Player ${botPlayerId} not found`);

    const pd = state.publicData as unknown as Phase10PublicData;
    const turnPhase = pd.turnPhase ?? 'draw';

    if (turnPhase === 'draw') {
      return this.decideDrawAction(state, player, pd);
    } else {
      // discard phase — may also lay-down, hit-meld, or play-skip
      return this.decideDiscardPhaseAction(state, player, pd);
    }
  }

  private decideDrawAction(
    state: GameState,
    player: GameState['players'][0],
    pd: Phase10PublicData,
  ): PlayerAction {
    const discardTop = pd.discardTop;
    const phaseNum = player.currentPhase ?? 1;
    const req = PHASE_REQUIREMENTS[phaseNum];

    // Check if taking the discard top would help complete the phase
    if (discardTop && discardTop.phase10Type !== 'skip' && req) {
      const hypotheticalHand = [...player.hand, discardTop];
      if (canCompletePhase(hypotheticalHand, req)) {
        return { type: 'draw', payload: { source: 'discard' } };
      }

      // Also draw from discard if it helps build toward the phase
      if (this.discardAdvancesPhase(discardTop, player.hand, req)) {
        return { type: 'draw', payload: { source: 'discard' } };
      }
    }

    return { type: 'draw', payload: { source: 'deck' } };
  }

  private decideDiscardPhaseAction(
    state: GameState,
    player: GameState['players'][0],
    pd: Phase10PublicData,
  ): PlayerAction {
    const hand = player.hand;
    const phaseNum = player.currentPhase ?? 1;
    const req = PHASE_REQUIREMENTS[phaseNum];

    // 1. Check for skip card — play immediately targeting most-cards player
    const skipCard = hand.find((c) => c.phase10Type === 'skip');
    if (skipCard) {
      const target = this.findTargetForSkip(state, player.playerId);
      if (target) {
        return {
          type: 'play-skip',
          payload: { targetPlayerId: target },
        };
      }
    }

    // 2. If bot can lay down phase → lay it down
    if (!player.phaseLaidDown && req && canCompletePhase(hand, req)) {
      const arrangement = findPhaseArrangement(hand, req);
      if (arrangement) {
        return {
          type: 'lay-down',
          payload: {
            phase: phaseNum,
            groups: arrangement,
          },
        };
      }
    }

    // 3. If phase already laid → try to hit a meld with highest-value card
    if (player.phaseLaidDown && pd.laidDownPhases) {
      const hitAction = this.findBestHitMeld(hand, pd.laidDownPhases);
      if (hitAction) return hitAction;
    }

    // 4. Discard: highest-value card not part of potential phase combination
    return this.decideDiscard(hand, phaseNum, req);
  }

  private discardAdvancesPhase(
    card: Card,
    hand: Card[],
    req: PhaseRequirement,
  ): boolean {
    if (card.phase10Type === 'wild') return true; // wild always helps

    // Check if card brings us closer to any group in the requirement
    for (const groupReq of req.groups) {
      if (groupReq.type === 'set') {
        // Does card have same value as 2+ existing cards?
        const sameValue = hand.filter(
          (c) => c.phase10Type === 'number' && c.value === card.value,
        );
        if (sameValue.length >= groupReq.count - 2) return true;
      } else if (groupReq.type === 'run') {
        // Does card extend an existing partial run?
        const numbers = hand.filter((c) => c.phase10Type === 'number');
        const sorted = [...numbers, card].sort((a, b) => a.value - b.value);
        // Simple check: consecutive cards
        let consecutive = 1;
        let maxConsec = 1;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i]!.value === sorted[i - 1]!.value + 1) {
            consecutive++;
            maxConsec = Math.max(maxConsec, consecutive);
          } else {
            consecutive = 1;
          }
        }
        if (maxConsec >= groupReq.count - 2) return true;
      } else if (groupReq.type === 'color') {
        if (card.phase10Type === 'number') {
          const sameColor = hand.filter(
            (c) => c.phase10Type === 'number' && c.phase10Color === card.phase10Color,
          );
          if (sameColor.length >= groupReq.count - 2) return true;
        }
      }
    }
    return false;
  }

  private findTargetForSkip(state: GameState, botPlayerId: string): string | null {
    const opponents = state.players.filter((p) => p.playerId !== botPlayerId && !p.isOut);
    if (opponents.length === 0) return null;

    // Target opponent with most cards
    let maxCards = -1;
    let target: string | null = null;
    for (const opp of opponents) {
      if (opp.hand.length > maxCards) {
        maxCards = opp.hand.length;
        target = opp.playerId;
      }
    }
    return target;
  }

  private findBestHitMeld(
    hand: Card[],
    laidDownPhases: Record<string, Array<{ type: string; cardIds: string[] }>>,
  ): PlayerAction | null {
    let bestCard: Card | null = null;
    let bestAction: PlayerAction | null = null;
    let bestScore = -1;

    for (const [targetPlayerId, groups] of Object.entries(laidDownPhases)) {
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex]!;
        const phaseGroup = { type: group.type as 'set' | 'run' | 'color', cardIds: group.cardIds };

        for (const card of hand) {
          if (card.phase10Type === 'wild') continue; // never hit with wild — save it
          if (card.phase10Type === 'skip') continue;
          if (canHitMeld(card, phaseGroup)) {
            const score = scoreCard(card);
            if (score > bestScore) {
              bestScore = score;
              bestCard = card;
              bestAction = {
                type: 'hit-meld',
                payload: {
                  targetPlayerId,
                  groupIndex,
                  cardIds: [card.id],
                },
              };
            }
          }
        }
      }
    }

    return bestAction;
  }

  private decideDiscard(
    hand: Card[],
    phaseNum: number,
    req: PhaseRequirement | undefined,
  ): PlayerAction {
    if (hand.length === 0) {
      return { type: 'pass' };
    }

    // Never discard wilds
    const discardable = hand.filter((c) => c.phase10Type !== 'wild');
    if (discardable.length === 0) {
      // All wilds — this shouldn't normally happen, but discard the rightmost non-wild or pass
      return { type: 'pass' };
    }

    // Find cards that are part of potential phase combination
    const phaseCardIds = req
      ? this.getPhaseCardIds(hand, req)
      : new Set<string>();

    // Prefer to discard non-phase cards with highest value
    const nonPhaseCards = discardable.filter((c) => !phaseCardIds.has(c.id));
    if (nonPhaseCards.length > 0) {
      const toDiscard = nonPhaseCards.reduce(
        (max, card) => (scoreCard(card) > scoreCard(max) ? card : max),
        nonPhaseCards[0]!,
      );
      return { type: 'discard', cardIds: [toDiscard.id] };
    }

    // All non-wild cards are phase cards — discard the least valuable phase card
    const toDiscard = discardable.reduce(
      (min, card) => (scoreCard(card) < scoreCard(min) ? card : min),
      discardable[0]!,
    );
    return { type: 'discard', cardIds: [toDiscard.id] };
  }

  private getPhaseCardIds(hand: Card[], req: PhaseRequirement): Set<string> {
    try {
      const arrangement = findPhaseArrangement(hand, req);
      if (arrangement) {
        const ids = new Set<string>(arrangement.flatMap((g: { cardIds: string[] }) => g.cardIds));
        return ids;
      }
    } catch {
      // ignore
    }
    return new Set<string>();
  }
}
