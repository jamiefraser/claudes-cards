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
  findPhaseArrangement,
  canHitMeld,
  type PhaseGroup,
} from '../../games/phase10/engine';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Internal type for publicData in Phase 10 state
// ---------------------------------------------------------------------------

interface Phase10PublicData {
  discardTop?: Card | null;
  drawPileSize?: number;
  turnPhase?: 'draw' | 'discard' | string;
  skippedPlayers?: string[];
  laidDownPhases?: Record<string, Array<{ type: string; cardIds: string[]; cards?: Card[] }>>;
  scoringAcks?: string[];
  handWinnerId?: string;
  handScores?: Record<string, number>;
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

    // Scoring overlay between hands — bots acknowledge instantly so they
    // don't hold up the next deal. Humans get to read the scoreboard at
    // their own pace; bots skip straight through.
    if (state.phase === 'scoring') {
      const acks = pd.scoringAcks ?? [];
      if (!acks.includes(botPlayerId)) {
        return { type: 'ack-scoring' };
      }
      // Already acked — nothing to do until the round transitions.
      return { type: 'pass' };
    }

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
      if (findPhaseArrangement(hypotheticalHand, req) !== null) {
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

    // 1. Check for skip card — play immediately targeting most-cards player.
    //    If no valid target exists (e.g. all opponents already out), the
    //    skip will fall through to step 4 where decideDiscard prefers to
    //    dump it rather than keep dead weight.
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

    // 2. If bot can lay down phase → lay it down.
    //    findPhaseArrangement is O(rank-diversity × hand-size) and
    //    canCompletePhase wraps the same search, so call it only once.
    if (req && !player.phaseLaidDown) {
      const arrangement: PhaseGroup[] | null = findPhaseArrangement(hand, req);
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

    // 3. If phase already laid → try to hit a meld.
    //    Gate on hand.length >= 2 — you can't go out on a hit in Phase 10,
    //    you must always keep at least one card to discard. Skipping this
    //    gate would let the bot empty its hand via hit-melds and then fall
    //    to decideDiscard(hand=[]) → 'pass' → stranded schedule keys →
    //    sweeper spins forever. (This is the post-lay-down stuck path the
    //    user reported.)
    //    First pass: highest-value non-wild card (wilds are valuable, save them).
    //    Second pass: allow wilds to dump them so the bot can shed weight
    //    instead of getting stuck with a hand of only wilds after lay-down.
    if (player.phaseLaidDown && pd.laidDownPhases && hand.length >= 2) {
      const hitNonWild = this.findBestHitMeld(hand, pd.laidDownPhases, { allowWilds: false });
      if (hitNonWild) return hitNonWild;
      const hitWild = this.findBestHitMeld(hand, pd.laidDownPhases, { allowWilds: true });
      if (hitWild) return hitWild;
    }

    // 4. Discard. Guaranteed to produce a legal discard when hand is non-empty;
    //    critically this must never return 'pass', otherwise BotPlayer DELs
    //    the schedule keys and the sweeper re-fires the same 'pass' forever,
    //    leaving the bot stuck in "Thinking…". By this point findPhaseArrangement
    //    returned null (or phase is already laid), so there is no "safe" set
    //    of phase cards to protect — decideDiscard just picks the best dump.
    return this.decideDiscard(hand, new Set<string>());
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
    laidDownPhases: Record<string, Array<{ type: string; cardIds: string[]; cards?: Card[] }>>,
    opts: { allowWilds: boolean } = { allowWilds: false },
  ): PlayerAction | null {
    let bestAction: PlayerAction | null = null;
    let bestScore = -1;

    for (const [targetPlayerId, groups] of Object.entries(laidDownPhases)) {
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex]!;
        // Pass `cards` through so canHitMeld can do real rank/run/colour
        // validation. Without this the bot would generate illegal hits
        // that the engine then rejects, sending the bot into its fallback
        // chain for every "plausible" card.
        const phaseGroup = {
          type: group.type as 'set' | 'run' | 'color',
          cardIds: group.cardIds,
          cards: group.cards,
        };

        for (const card of hand) {
          if (card.phase10Type === 'skip') continue;
          if (card.phase10Type === 'wild' && !opts.allowWilds) continue;
          if (canHitMeld(card, phaseGroup)) {
            const score = scoreCard(card);
            if (score > bestScore) {
              bestScore = score;
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

  /**
   * Pick a discard. Must always return a legal `discard` when the hand is
   * non-empty — see decideDiscardPhaseAction step 4 for why 'pass' is
   * poisonous at this point in the turn.
   *
   * Preference order:
   *   1. Skip card (no point hoarding once it can't be played).
   *   2. Non-phase number card with highest point value.
   *   3. Phase-useful number card with lowest point value.
   *   4. Wild card (truly last resort — only happens when hand is all wilds).
   */
  private decideDiscard(hand: Card[], phaseCardIds: Set<string>): PlayerAction {
    if (hand.length === 0) return { type: 'pass' };

    const skips = hand.filter((c) => c.phase10Type === 'skip');
    if (skips.length > 0) {
      return { type: 'discard', cardIds: [skips[0]!.id] };
    }

    const numbers = hand.filter((c) => c.phase10Type === 'number');
    if (numbers.length > 0) {
      const nonPhase = numbers.filter((c) => !phaseCardIds.has(c.id));
      if (nonPhase.length > 0) {
        const toDiscard = nonPhase.reduce(
          (max, card) => (scoreCard(card) > scoreCard(max) ? card : max),
          nonPhase[0]!,
        );
        return { type: 'discard', cardIds: [toDiscard.id] };
      }
      // All number cards are phase-useful — dump the cheapest.
      const toDiscard = numbers.reduce(
        (min, card) => (scoreCard(card) < scoreCard(min) ? card : min),
        numbers[0]!,
      );
      return { type: 'discard', cardIds: [toDiscard.id] };
    }

    // Nothing but wilds left. Discard one to avoid stalling the game —
    // keeping the rest is still worth 25 points each next round.
    const wild = hand[hand.length - 1]!;
    return { type: 'discard', cardIds: [wild.id] };
  }
}
