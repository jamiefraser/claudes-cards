/**
 * Phase 10 Game Engine
 *
 * Implements IGameEngine for Phase 10 per SPEC.md §19.
 *
 * Rules:
 * - 60-card deck: 48 number cards (4 colors × 12 numbers), 8 Wild, 4 Skip
 * - 2–6 players, each dealt 10 cards
 * - On a turn: draw (deck or discard pile) then discard one card
 * - Wild cards substitute for any number/color
 * - Skip cards make target player lose their next turn
 * - Complete 10 phases in order to win
 * - Scoring: face value (1–9), 10 pts (10–12), 15 pts (skip), 25 pts (wild)
 * - Lowest score wins after Phase 10 is completed
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerState,
  PlayerRanking,
  Card,
} from '@card-platform/shared-types';
import { createPhase10Deck } from '@card-platform/cards-engine';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Phase definitions
// ---------------------------------------------------------------------------

export interface PhaseGroup {
  type: 'set' | 'run' | 'color';
  cardIds: string[];
  /**
   * Full card objects, included so the frontend can render laid-down melds
   * face-up without having to look them up elsewhere (cards leave the hand
   * once laid down).
   */
  cards?: Card[];
}

export interface PhaseRequirement {
  groups: Array<{
    type: 'set' | 'run' | 'color';
    count: number;
  }>;
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

// ---------------------------------------------------------------------------
// Internal state stored in publicData
// ---------------------------------------------------------------------------

interface Phase10PublicData {
  drawPile: Card[];
  discardPile: Card[];
  discardTop: Card | null;
  drawPileSize: number;
  turnPhase: 'draw' | 'discard';
  skippedPlayers: string[];
  laidDownPhases: Record<string, PhaseGroup[]>;
}

// ---------------------------------------------------------------------------
// Engine implementation
// ---------------------------------------------------------------------------

export class Phase10Engine implements IGameEngine {
  readonly gameId = 'phase10';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  // -------------------------------------------------------------------------
  // startGame
  // -------------------------------------------------------------------------

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;

    if (playerIds.length < this.minPlayers || playerIds.length > this.maxPlayers) {
      throw new Error(`Phase 10 requires ${this.minPlayers}–${this.maxPlayers} players`);
    }

    // Build and shuffle deck
    const deck = createPhase10Deck();
    const shuffled = [...deck.cards];
    shuffle(shuffled);

    // Deal 10 cards to each player
    const players: PlayerState[] = playerIds.map((playerId) => {
      const hand = shuffled.splice(0, 10);
      return {
        playerId,
        displayName: playerId,
        hand,
        score: 0,
        isOut: false,
        isBot: false,
        currentPhase: 1,
        phaseLaidDown: false,
      };
    });

    // Flip one card to start discard pile
    const discardTopCard = shuffled.splice(0, 1)[0]!;
    const faceUpDiscard = { ...discardTopCard, faceUp: true };

    const publicData: Phase10PublicData = {
      drawPile: shuffled,
      discardPile: [faceUpDiscard],
      discardTop: faceUpDiscard,
      drawPileSize: shuffled.length,
      turnPhase: 'draw',
      skippedPlayers: [],
      laidDownPhases: {},
    };

    logger.debug('Phase10Engine.startGame', { roomId, playerCount: playerIds.length });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[0]!,
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // applyAction
  // -------------------------------------------------------------------------

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    // Validate it is the player's turn
    if (state.currentTurn !== playerId) {
      throw new Error(`Not ${playerId}'s turn (current: ${state.currentTurn})`);
    }

    const pd = state.publicData as unknown as Phase10PublicData;

    switch (action.type) {
      case 'draw':
        return this.handleDraw(state, playerId, action, pd);
      case 'discard':
        return this.handleDiscard(state, playerId, action, pd);
      case 'lay-down':
        return this.handleLayDown(state, playerId, action, pd);
      case 'hit-meld':
        return this.handleHitMeld(state, playerId, action, pd);
      case 'play-skip':
        return this.handlePlaySkip(state, playerId, action, pd);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  // -------------------------------------------------------------------------
  // getValidActions
  // -------------------------------------------------------------------------

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];

    const pd = state.publicData as unknown as Phase10PublicData;
    const player = state.players.find((p) => p.playerId === playerId);
    if (!player) return [];

    const actions: PlayerAction[] = [];

    if (pd.turnPhase === 'draw') {
      actions.push({ type: 'draw', payload: { source: 'deck' } });
      if (pd.discardTop) {
        actions.push({ type: 'draw', payload: { source: 'discard' } });
      }
    } else {
      // discard phase
      player.hand.forEach((card) => {
        actions.push({ type: 'discard', cardIds: [card.id] });
      });

      // lay-down if not already laid
      if (!player.phaseLaidDown) {
        const phaseNum = player.currentPhase ?? 1;
        const req = PHASE_REQUIREMENTS[phaseNum];
        if (req && canCompletePhase(player.hand, req)) {
          actions.push({ type: 'lay-down', payload: { phase: phaseNum } });
        }
      }

      // hit-meld if phase laid
      if (player.phaseLaidDown && pd.laidDownPhases) {
        Object.entries(pd.laidDownPhases).forEach(([targetId, groups]) => {
          groups.forEach((group, groupIndex) => {
            player.hand.forEach((card) => {
              if (canHitMeld(card, group)) {
                actions.push({
                  type: 'hit-meld',
                  payload: { targetPlayerId: targetId, groupIndex, cardIds: [card.id] },
                });
              }
            });
          });
        });
      }

      // play-skip
      const skipCards = player.hand.filter((c) => c.phase10Type === 'skip');
      if (skipCards.length > 0) {
        state.players
          .filter((p) => p.playerId !== playerId)
          .forEach((target) => {
            skipCards.forEach((skip) => {
              actions.push({
                type: 'play-skip',
                payload: { targetPlayerId: target.playerId, cardId: skip.id },
              });
            });
          });
      }
    }

    return actions;
  }

  // -------------------------------------------------------------------------
  // computeResult
  // -------------------------------------------------------------------------

  computeResult(state: GameState): PlayerRanking[] {
    const sorted = [...state.players].sort((a, b) => {
      // Primary: phase number descending (higher phase = better progress)
      const phaseA = a.currentPhase ?? 1;
      const phaseB = b.currentPhase ?? 1;
      if (phaseB !== phaseA) return phaseB - phaseA;
      // Secondary: score ascending (lower = better)
      return a.score - b.score;
    });

    return sorted.map((player, idx) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      rank: idx + 1,
      score: player.score,
      isBot: player.isBot,
    }));
  }

  // -------------------------------------------------------------------------
  // isGameOver
  // -------------------------------------------------------------------------

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }

  // -------------------------------------------------------------------------
  // computeHandScore (exported for testing)
  // -------------------------------------------------------------------------

  computeHandScore(hand: Card[]): number {
    return hand.reduce((total, card) => total + scoreCard(card), 0);
  }

  // -------------------------------------------------------------------------
  // Private action handlers
  // -------------------------------------------------------------------------

  private handleDraw(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: Phase10PublicData,
  ): GameState {
    if (pd.turnPhase !== 'draw') {
      throw new Error('Cannot draw — already drew this turn');
    }

    const source = (action.payload?.source as string) ?? 'deck';
    const player = state.players.find((p) => p.playerId === playerId)!;
    let drawnCard: Card;
    let newDrawPile = [...pd.drawPile];
    let newDiscardPile = [...pd.discardPile];

    if (source === 'discard') {
      if (newDiscardPile.length === 0) {
        throw new Error('Discard pile is empty');
      }
      drawnCard = newDiscardPile.pop()!;
    } else {
      // Draw from deck
      if (newDrawPile.length === 0) {
        // Reshuffle discard pile into draw pile (keep top card)
        if (newDiscardPile.length <= 1) {
          throw new Error('No cards left to draw');
        }
        const keepTop = newDiscardPile.pop()!;
        newDrawPile = newDiscardPile;
        shuffle(newDrawPile);
        newDiscardPile = [keepTop];
      }
      drawnCard = newDrawPile.pop()!;
    }

    const newHand = [...player.hand, { ...drawnCard, faceUp: false }];
    const newDiscardTop = newDiscardPile.length > 0 ? newDiscardPile[newDiscardPile.length - 1]! : null;

    const newPublicData: Phase10PublicData = {
      ...pd,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      discardTop: newDiscardTop,
      drawPileSize: newDrawPile.length,
      turnPhase: 'discard',
    };

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: newHand } : p,
      ),
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleDiscard(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: Phase10PublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') {
      throw new Error('Cannot discard — must draw first');
    }

    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified for discard');

    const player = state.players.find((p) => p.playerId === playerId)!;
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) throw new Error(`Card ${cardId} not in player's hand`);

    const discardedCard = player.hand[cardIndex]!;
    const newHand = player.hand.filter((c) => c.id !== cardId);
    const faceUpDiscard = { ...discardedCard, faceUp: true };
    const newDiscardPile = [...pd.discardPile, faceUpDiscard];

    // Check if player went out
    const wentOut = newHand.length === 0;

    let newPlayers = state.players.map((p) =>
      p.playerId === playerId
        ? { ...p, hand: newHand, isOut: wentOut || p.isOut }
        : p,
    );

    // Determine next turn
    const { nextPlayerId, newSkippedPlayers } = getNextPlayer(
      state.players,
      playerId,
      pd.skippedPlayers,
    );

    // Check if round ends
    const anyoneOut = newPlayers.some((p) => p.isOut);
    let newPhase = state.phase;

    if (anyoneOut) {
      // Compute scores for this round
      newPlayers = newPlayers.map((p) => {
        if (p.isOut) return p;
        const roundPoints = this.computeHandScore(p.hand);
        return { ...p, score: p.score + roundPoints };
      });

      // Check if game is over (someone completed phase 10 and went out)
      const winner = newPlayers.find((p) => p.isOut && (p.currentPhase ?? 1) > 10);
      if (winner) {
        newPhase = 'ended';
      } else {
        // Round over — check if anyone has won
        const phase10Completers = newPlayers.filter(
          (p) => p.isOut && (p.currentPhase ?? 1) > 10,
        );
        if (phase10Completers.length > 0) {
          newPhase = 'ended';
        } else {
          newPhase = 'scoring';
        }
      }
    }

    const newPublicData: Phase10PublicData = {
      ...pd,
      discardPile: newDiscardPile,
      discardTop: faceUpDiscard,
      turnPhase: 'draw',
      skippedPlayers: newSkippedPlayers,
    };

    return {
      ...state,
      version: state.version + 1,
      phase: newPhase,
      players: newPlayers,
      currentTurn: wentOut ? null : nextPlayerId,
      turnNumber: state.turnNumber + 1,
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleLayDown(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: Phase10PublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') {
      throw new Error('Cannot lay down — must draw first');
    }

    const player = state.players.find((p) => p.playerId === playerId)!;

    if (player.phaseLaidDown) {
      throw new Error('Player has already laid down their phase this round');
    }

    const playerPhase = player.currentPhase ?? 1;
    const phaseNum = (action.payload?.phase as number | undefined) ?? playerPhase;

    if (phaseNum !== playerPhase) {
      throw new Error(`Player is on phase ${playerPhase}, not ${phaseNum}`);
    }

    const req = PHASE_REQUIREMENTS[phaseNum];
    if (!req) throw new Error(`Invalid phase number: ${phaseNum}`);

    // If the client didn't pre-arrange the groups, auto-arrange from the
    // player's hand. Keeps the UX simple: user clicks "Lay Down" when their
    // hand satisfies the phase and we pick a valid arrangement for them.
    let groups = action.payload?.groups as PhaseGroup[] | undefined;
    if (!groups || !Array.isArray(groups)) {
      const auto = findPhaseArrangement(player.hand, req);
      if (!auto) {
        throw new Error('Hand does not satisfy the current phase');
      }
      groups = auto;
    }

    // Validate the submitted groups against phase requirements
    validateLayDown(player.hand, groups, req);

    // Remove laid-down cards from hand
    const allLaydownCardIds = new Set(groups.flatMap((g) => g.cardIds));
    const newHand = player.hand.filter((c) => !allLaydownCardIds.has(c.id));

    // Attach the full Card objects to each group so clients can render
    // the melds face-up without a separate lookup.
    const handById = new Map(player.hand.map((c) => [c.id, c]));
    const groupsWithCards: PhaseGroup[] = groups.map((g) => ({
      ...g,
      cards: g.cardIds
        .map((id) => handById.get(id))
        .filter((c): c is Card => !!c)
        .map((c) => ({ ...c, faceUp: true })),
    }));

    // Store laid-down groups
    const newLaidDownPhases: Record<string, PhaseGroup[]> = {
      ...pd.laidDownPhases,
      [playerId]: groupsWithCards,
    };

    const newPublicData: Phase10PublicData = {
      ...pd,
      laidDownPhases: newLaidDownPhases,
    };

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: newHand, phaseLaidDown: true }
          : p,
      ),
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleHitMeld(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: Phase10PublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') {
      throw new Error('Cannot hit meld — must draw first');
    }

    const player = state.players.find((p) => p.playerId === playerId)!;
    if (!player.phaseLaidDown) {
      throw new Error('Cannot hit meld before laying down own phase');
    }

    const targetPlayerId = action.payload?.targetPlayerId as string;
    const groupIndex = action.payload?.groupIndex as number;
    const cardIds = action.payload?.cardIds as string[] ?? action.cardIds ?? [];

    if (!targetPlayerId || groupIndex === undefined || !cardIds.length) {
      throw new Error('hit-meld requires targetPlayerId, groupIndex, and cardIds');
    }

    const targetGroups = pd.laidDownPhases[targetPlayerId];
    if (!targetGroups) {
      throw new Error(`Player ${targetPlayerId} has no laid-down phase`);
    }

    const group = targetGroups[groupIndex];
    if (!group) {
      throw new Error(`Group index ${groupIndex} does not exist`);
    }

    // Validate cards can be added to the group
    const cardsToHit = player.hand.filter((c) => cardIds.includes(c.id));
    if (cardsToHit.length !== cardIds.length) {
      throw new Error('One or more hit cards not in player hand');
    }

    for (const card of cardsToHit) {
      if (!canHitMeld(card, group)) {
        throw new Error(`Card ${card.id} cannot be added to this meld`);
      }
    }

    // Add cards to group
    const updatedGroup: PhaseGroup = {
      ...group,
      cardIds: [...group.cardIds, ...cardIds],
    };
    const updatedGroups = [...targetGroups];
    updatedGroups[groupIndex] = updatedGroup;

    const newHand = player.hand.filter((c) => !cardIds.includes(c.id));

    const newPublicData: Phase10PublicData = {
      ...pd,
      laidDownPhases: {
        ...pd.laidDownPhases,
        [targetPlayerId]: updatedGroups,
      },
    };

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: newHand } : p,
      ),
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handlePlaySkip(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: Phase10PublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') {
      throw new Error('Cannot play skip — must draw first');
    }

    const targetPlayerId = action.payload?.targetPlayerId as string;
    if (!targetPlayerId) throw new Error('play-skip requires targetPlayerId');

    const player = state.players.find((p) => p.playerId === playerId)!;
    const targetPlayer = state.players.find((p) => p.playerId === targetPlayerId);
    if (!targetPlayer) throw new Error(`Target player ${targetPlayerId} not found`);

    // Find a skip card in hand
    const skipCard = player.hand.find((c) => c.phase10Type === 'skip');
    if (!skipCard) throw new Error('No skip card in hand');

    const newHand = player.hand.filter((c) => c.id !== skipCard.id);

    // Add skip card to discard pile
    const faceUpSkip = { ...skipCard, faceUp: true };
    const newDiscardPile = [...pd.discardPile, faceUpSkip];

    const newSkippedPlayers = [...pd.skippedPlayers, targetPlayerId];

    const newPublicData: Phase10PublicData = {
      ...pd,
      discardPile: newDiscardPile,
      discardTop: faceUpSkip,
      skippedPlayers: newSkippedPlayers,
    };

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: newHand } : p,
      ),
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
}

function scoreCard(card: Card): number {
  // Mattel Phase 10 scoring for cards remaining in a losing player's hand:
  //   1–9   → 5 points each
  //   10–12 → 10 points each
  //   Skip  → 15 points
  //   Wild  → 25 points
  if (card.phase10Type === 'wild') return 25;
  if (card.phase10Type === 'skip') return 15;
  if (card.value >= 10) return 10;
  return 5;
}

function getNextPlayer(
  players: PlayerState[],
  currentPlayerId: string,
  skippedPlayers: string[],
): { nextPlayerId: string; newSkippedPlayers: string[] } {
  const currentIdx = players.findIndex((p) => p.playerId === currentPlayerId);
  let nextIdx = (currentIdx + 1) % players.length;

  const newSkippedPlayers = [...skippedPlayers];

  // Skip players who are in skippedPlayers list
  if (newSkippedPlayers.includes(players[nextIdx]!.playerId)) {
    // Remove from skipped list (they were skipped)
    const skipIdx = newSkippedPlayers.indexOf(players[nextIdx]!.playerId);
    newSkippedPlayers.splice(skipIdx, 1);
    nextIdx = (nextIdx + 1) % players.length;
  }

  return {
    nextPlayerId: players[nextIdx]!.playerId,
    newSkippedPlayers,
  };
}

// ---------------------------------------------------------------------------
// Phase validation
// ---------------------------------------------------------------------------

function validateLayDown(
  hand: Card[],
  groups: PhaseGroup[],
  req: PhaseRequirement,
): void {
  if (groups.length !== req.groups.length) {
    throw new Error(
      `Phase requires ${req.groups.length} groups, got ${groups.length}`,
    );
  }

  // Check all card IDs are in hand and not duplicated
  const allCardIds = groups.flatMap((g) => g.cardIds);
  const idSet = new Set(allCardIds);
  if (idSet.size !== allCardIds.length) {
    throw new Error('Duplicate card IDs in lay-down groups');
  }

  const handIds = new Set(hand.map((c) => c.id));
  for (const id of allCardIds) {
    if (!handIds.has(id)) {
      throw new Error(`Card ${id} not found in player's hand`);
    }
  }

  // Validate each group
  for (let i = 0; i < req.groups.length; i++) {
    const groupReq = req.groups[i]!;
    const group = groups[i]!;

    if (!group) {
      throw new Error(`Missing group ${i}`);
    }

    const groupCards = group.cardIds.map((id) => {
      const card = hand.find((c) => c.id === id);
      if (!card) throw new Error(`Card ${id} not in hand`);
      return card;
    });

    if (group.type !== groupReq.type) {
      throw new Error(
        `Group ${i} type mismatch: expected ${groupReq.type}, got ${group.type}`,
      );
    }

    if (groupCards.length < groupReq.count) {
      throw new Error(
        `Group ${i} has ${groupCards.length} cards, needs ${groupReq.count}`,
      );
    }

    switch (groupReq.type) {
      case 'set':
        validateSet(groupCards);
        break;
      case 'run':
        validateRun(groupCards, groupReq.count);
        break;
      case 'color':
        validateColor(groupCards, groupReq.count);
        break;
    }
  }

  // Two set-groups must be of different ranks — "2 sets of 3" means two
  // different numbers, not six of the same.
  const setRanks: number[] = [];
  for (let i = 0; i < req.groups.length; i++) {
    if (req.groups[i]!.type !== 'set') continue;
    const group = groups[i]!;
    const cards = group.cardIds
      .map((id) => hand.find((c) => c.id === id))
      .filter((c): c is Card => !!c);
    const nonWild = cards.find((c) => c.phase10Type === 'number');
    if (nonWild) setRanks.push(nonWild.value);
  }
  const distinct = new Set(setRanks);
  if (distinct.size !== setRanks.length) {
    throw new Error('Two sets in the same phase must be of different ranks');
  }
}

function validateSet(cards: Card[]): void {
  // A set is cards all with the same numeric value (wilds can sub for any).
  // Mattel rule: a laid-down group must contain at least one natural number
  // card — you can't make a group entirely of wilds.
  const nonWilds = cards.filter((c) => c.phase10Type !== 'wild');

  if (nonWilds.length === 0) {
    throw new Error('A set cannot be made entirely of wild cards');
  }

  const targetValue = nonWilds[0]!.value;
  for (const card of nonWilds) {
    if (card.phase10Type === 'skip') {
      throw new Error('Skip cards cannot be part of a set');
    }
    if (card.value !== targetValue) {
      throw new Error(
        `Set contains mixed values: ${targetValue} and ${card.value}`,
      );
    }
  }
}

function validateRun(cards: Card[], minCount: number): void {
  // A run is a sequence of consecutive numbers (wilds can fill gaps)
  if (cards.length < minCount) {
    throw new Error(`Run requires at least ${minCount} cards`);
  }

  const nonWilds = cards.filter((c) => c.phase10Type !== 'wild');
  const wilds = cards.filter((c) => c.phase10Type === 'wild');
  const wildCount = wilds.length;

  if (nonWilds.some((c) => c.phase10Type === 'skip')) {
    throw new Error('Skip cards cannot be part of a run');
  }

  if (nonWilds.length === 0) {
    throw new Error('A run cannot be made entirely of wild cards');
  }

  // Sort non-wild cards by value
  const sorted = [...nonWilds].sort((a, b) => a.value - b.value);

  // Check for duplicate values (non-wilds)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.value === sorted[i - 1]!.value) {
      throw new Error(`Run has duplicate value: ${sorted[i]!.value}`);
    }
  }

  // Count gaps that need to be filled by wilds
  const min = sorted[0]!.value;
  const max = sorted[sorted.length - 1]!.value;

  // Total span including endpoints
  const span = max - min + 1;

  // Gaps = span - non-wild count
  const gaps = span - nonWilds.length;

  if (gaps > wildCount) {
    throw new Error(
      `Run has ${gaps} gaps but only ${wildCount} wild cards available`,
    );
  }

  // Total cards in run
  const totalRunLength = span + (wildCount - gaps);
  if (totalRunLength < minCount) {
    throw new Error(`Run length ${totalRunLength} is less than required ${minCount}`);
  }
}

function validateColor(cards: Card[], minCount: number): void {
  if (cards.length < minCount) {
    throw new Error(`Color group requires at least ${minCount} cards`);
  }

  const nonWilds = cards.filter((c) => c.phase10Type !== 'wild');

  if (nonWilds.some((c) => c.phase10Type === 'skip')) {
    throw new Error('Skip cards cannot be part of a color group');
  }

  if (nonWilds.length === 0) {
    throw new Error('A colour group cannot be made entirely of wild cards');
  }

  const targetColor = nonWilds[0]!.phase10Color;
  for (const card of nonWilds) {
    if (card.phase10Color !== targetColor) {
      throw new Error(
        `Color group has mixed colors: ${targetColor} and ${card.phase10Color}`,
      );
    }
  }
}

export function canCompletePhase(hand: Card[], req: PhaseRequirement): boolean {
  try {
    // Try to find a valid arrangement of cards that satisfies the phase
    const result = findPhaseArrangement(hand, req);
    return result !== null;
  } catch {
    return false;
  }
}

export function findPhaseArrangement(
  hand: Card[],
  req: PhaseRequirement,
): PhaseGroup[] | null {
  const wilds = hand.filter((c) => c.phase10Type === 'wild');
  const numbers = hand.filter((c) => c.phase10Type === 'number');

  if (req.groups.length === 1) {
    const groupReq = req.groups[0]!;
    const result = findGroup(numbers, wilds, groupReq);
    if (result) return [result];
    return null;
  }

  // Two groups — search over possible first-group choices so that the second
  // group can be found too. For sets, each set must be of a different rank.
  const [req1, req2] = req.groups;
  if (!req1 || !req2) return null;

  // Candidate rank values to try for a "set" group. For a run we only have
  // one starting point per rank. For a color we try each color.
  // We enumerate all distinct group1 candidates, then for each one check if
  // group2 can be built from the remaining cards respecting any "different
  // rank" constraint.
  const candidates1 = enumerateGroupCandidates(numbers, wilds, req1);

  for (const group1 of candidates1) {
    const usedIds = new Set(group1.cardIds);
    const remainingNumbers = numbers.filter((c) => !usedIds.has(c.id));
    const wildsUsedInGroup1 = group1.cardIds.filter((id) =>
      wilds.some((w) => w.id === id),
    ).length;
    const remainingWilds = wilds.slice(wildsUsedInGroup1);

    // Constraint: if both groups are sets, they must be of different ranks.
    const forbiddenValues =
      req1.type === 'set' && req2.type === 'set'
        ? new Set<number>([setRank(group1, hand)].filter((v): v is number => v !== null))
        : undefined;

    const group2 = findGroup(remainingNumbers, remainingWilds, req2, forbiddenValues);
    if (group2) return [group1, group2];
  }

  return null;
}

/** Determine the "rank" of a set group (the value all cards share). */
function setRank(group: PhaseGroup, hand: Card[]): number | null {
  const byId = new Map(hand.map((c) => [c.id, c]));
  for (const id of group.cardIds) {
    const card = byId.get(id);
    if (card && card.phase10Type === 'number') return card.value;
  }
  return null; // all wilds — no rank
}

/**
 * Enumerate every reasonable candidate for a single phase-group, so
 * findPhaseArrangement can try more than just the first match. For sets
 * we try each rank; for runs each starting value; for colors each colour.
 */
function enumerateGroupCandidates(
  numbers: Card[],
  wilds: Card[],
  req: { type: 'set' | 'run' | 'color'; count: number },
): PhaseGroup[] {
  if (req.type === 'set') {
    const byValue: Record<number, Card[]> = {};
    for (const c of numbers) {
      byValue[c.value] = byValue[c.value] ?? [];
      byValue[c.value]!.push(c);
    }
    const out: PhaseGroup[] = [];
    for (const [, cards] of Object.entries(byValue)) {
      // Greedy: take ALL cards of this rank, then top up with wilds if needed.
      if (cards.length >= req.count) {
        out.push({ type: 'set', cardIds: cards.map((c) => c.id) });
      } else if (cards.length + wilds.length >= req.count) {
        const needed = req.count - cards.length;
        out.push({
          type: 'set',
          cardIds: [
            ...cards.map((c) => c.id),
            ...wilds.slice(0, needed).map((w) => w.id),
          ],
        });
      }
    }
    return out;
  }

  // For runs and colors, fall back to the greedy single-result finder.
  const single = findGroup(numbers, wilds, req);
  return single ? [single] : [];
}

function findGroup(
  numbers: Card[],
  wilds: Card[],
  req: { type: 'set' | 'run' | 'color'; count: number },
  forbiddenValues?: Set<number>,
): PhaseGroup | null {
  switch (req.type) {
    case 'set':
      return findSet(numbers, wilds, req.count, forbiddenValues);
    case 'run':
      return findRun(numbers, wilds, req.count);
    case 'color':
      return findColor(numbers, wilds, req.count);
    default:
      return null;
  }
}

function findSet(
  numbers: Card[],
  wilds: Card[],
  count: number,
  forbiddenValues?: Set<number>,
): PhaseGroup | null {
  // Group by value
  const byValue: Record<number, Card[]> = {};
  for (const card of numbers) {
    byValue[card.value] = byValue[card.value] ?? [];
    byValue[card.value]!.push(card);
  }

  for (const [valueStr, cards] of Object.entries(byValue)) {
    const value = Number(valueStr);
    if (forbiddenValues?.has(value)) continue;
    // Greedy: take ALL cards of this rank (never less than count, never more
    // than available) so the player dumps as much as possible in one set.
    if (cards.length >= count) {
      return { type: 'set', cardIds: cards.map((c) => c.id) };
    }
    if (cards.length + wilds.length >= count) {
      const needed = count - cards.length;
      return {
        type: 'set',
        cardIds: [
          ...cards.map((c) => c.id),
          ...wilds.slice(0, needed).map((w) => w.id),
        ],
      };
    }
  }

  return null;
}

function findRun(
  numbers: Card[],
  wilds: Card[],
  count: number,
): PhaseGroup | null {
  if (numbers.length + wilds.length < count) return null;

  // Sort by value
  const sorted = [...numbers].sort((a, b) => a.value - b.value);

  // Try starting at each possible value
  for (let start = 1; start <= 12 - count + 1; start++) {
    const runCards: string[] = [];
    let wildIdx = 0;
    let valid = true;

    for (let v = start; v < start + count; v++) {
      const card = sorted.find((c) => c.value === v && !runCards.includes(c.id));
      if (card) {
        runCards.push(card.id);
      } else if (wildIdx < wilds.length) {
        runCards.push(wilds[wildIdx]!.id);
        wildIdx++;
      } else {
        valid = false;
        break;
      }
    }

    if (valid && runCards.length >= count) {
      return { type: 'run', cardIds: runCards };
    }
  }

  return null;
}

function findColor(
  numbers: Card[],
  wilds: Card[],
  count: number,
): PhaseGroup | null {
  const colors = ['red', 'blue', 'green', 'yellow'] as const;

  for (const color of colors) {
    const colorCards = numbers.filter((c) => c.phase10Color === color);
    if (colorCards.length >= count) {
      return { type: 'color', cardIds: colorCards.slice(0, count).map((c) => c.id) };
    }
    if (colorCards.length + wilds.length >= count) {
      const needed = count - colorCards.length;
      return {
        type: 'color',
        cardIds: [
          ...colorCards.map((c) => c.id),
          ...wilds.slice(0, needed).map((w) => w.id),
        ],
      };
    }
  }

  return null;
}

export function canHitMeld(card: Card, group: PhaseGroup): boolean {
  if (card.phase10Type === 'wild') return true;
  if (card.phase10Type === 'skip') return false;

  // For set: card must match the value of existing cards in the group
  // We can't easily reconstruct value here without the full hand,
  // so for now accept number cards on sets (engine validates fully)
  if (group.type === 'set') {
    return card.phase10Type === 'number';
  }
  if (group.type === 'run') {
    return card.phase10Type === 'number';
  }
  if (group.type === 'color') {
    return card.phase10Type === 'number';
  }
  return false;
}
