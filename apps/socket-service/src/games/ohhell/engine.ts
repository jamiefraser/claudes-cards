/**
 * Oh Hell! — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Translates frontend actions (`bid`,
 * `play`, `ack-round`) into the pure core's Action shape and projects
 * a UI-friendly `publicData` contract.
 *
 * Supported action types (PlayerAction.type):
 *   - `bid`        : payload { amount: number }
 *   - `play`       : cardIds: [cardId]
 *   - `ack-round`  : no payload — advance past the scoring overlay
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerRanking,
  Card as PlatformCard,
  Rank as PlatformRank,
  Suit as PlatformSuit,
} from '@card-platform/shared-types';
import { logger } from '../../utils/logger';
import {
  newGame as coreNewGame,
  applyAction as coreApply,
  legalActions as coreLegalActions,
  DEFAULT_CONFIG,
  forbiddenBids,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type OhHellConfig,
  type Trick,
} from './core';

const SUIT_TO_PLATFORM: Record<CoreSuit, PlatformSuit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};
const RANK_TO_PLATFORM: Record<CoreRank, PlatformRank> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};
const RANK_NUMERIC: Record<CoreRank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

function toPlatformCard(c: CoreCard, faceUp: boolean): PlatformCard {
  return {
    id: c.id,
    deckType: 'standard',
    suit: SUIT_TO_PLATFORM[c.suit],
    rank: RANK_TO_PLATFORM[c.rank],
    value: c.joker ? 100 : RANK_NUMERIC[c.rank],
    faceUp,
  };
}

interface OhHellPublicData {
  core: CoreState;
  phase: CoreState['phase'];
  currentPlayerId: string | null;
  roundNumber: number;
  rounds: number[];
  handSize: number;
  dealerId: string;
  trumpSuit: PlatformSuit | null;
  turnUpCard: PlatformCard | null;
  bids: Record<string, number | null>;
  tricksWon: Record<string, number>;
  scores: Record<string, number>;
  currentTrick: Array<{ playerId: string; card: PlatformCard }>;
  ledSuit: PlatformSuit | null;
  forbiddenBids: number[];
  /** Max bid value allowed (= current handSize). UI uses to render bid picker. */
  maxBid: number;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class OhHellEngine implements IGameEngine {
  readonly gameId = 'ohhell';
  readonly supportsAsync = false;
  readonly minPlayers = 3;
  readonly maxPlayers = 7;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 3 || playerIds.length > 7) {
      throw new Error('Oh Hell requires 3–7 players');
    }
    const seed = hashString(roomId);
    const raw = ((config.options as Record<string, unknown> | undefined)?.['ohhell'] as
      | Partial<OhHellConfig>
      | undefined);
    const coreCfg: Partial<OhHellConfig> = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreCfg, seed);
    logger.debug('OhHellEngine.startGame', { roomId, seed, playerCount: playerIds.length });
    return projectState({ roomId, gameId, core, prevVersion: 0 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as OhHellPublicData;
    let core = pd.core;
    switch (action.type) {
      case 'bid': {
        const amount = (action.payload as { amount?: number } | undefined)?.amount;
        if (typeof amount !== 'number') throw new Error('bid requires numeric amount');
        core = coreApply(core, { kind: 'placeBid', playerId, bid: amount });
        break;
      }
      case 'play': {
        const cardId = action.cardIds?.[0];
        if (!cardId) throw new Error('play requires exactly one cardId');
        core = coreApply(core, { kind: 'playCard', playerId, cardId });
        break;
      }
      case 'ack-round': {
        core = coreApply(core, { kind: 'ackRound', playerId });
        break;
      }
      default:
        throw new Error(`Unknown action: ${action.type}`);
    }
    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      core,
      prevVersion: state.version,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as OhHellPublicData;
    const core = pd.core;
    const actions = coreLegalActions(core, playerId);
    const out: PlayerAction[] = [];
    for (const a of actions) {
      if (a.kind === 'placeBid') {
        out.push({ type: 'bid', payload: { amount: a.bid } });
      } else if (a.kind === 'playCard') {
        out.push({ type: 'play', cardIds: [a.cardId] });
      } else if (a.kind === 'ackRound') {
        out.push({ type: 'ack-round' });
      }
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    // Highest cumulative score wins; ties share a rank.
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    let lastScore: number | null = null;
    let lastRank = 0;
    return sorted.map((p, idx) => {
      const rank = p.score === lastScore ? lastRank : idx + 1;
      lastScore = p.score;
      lastRank = rank;
      return {
        playerId: p.playerId,
        displayName: p.displayName,
        rank,
        score: p.score,
        isBot: p.isBot,
      };
    });
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }
}

function projectCoreTrickToPlatform(
  trick: Trick | null,
): Array<{ playerId: string; card: PlatformCard }> {
  if (!trick) return [];
  return trick.plays.map((pl) => ({
    playerId: pl.playerId, card: toPlatformCard(pl.card, true),
  }));
}

function projectState(args: {
  roomId: string;
  gameId: string;
  core: CoreState;
  prevVersion: number;
}): GameState {
  const { roomId, gameId, core } = args;

  const bids: Record<string, number | null> = {};
  const tricksWon: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const p of core.players) {
    bids[p.id] = p.bid;
    tricksWon[p.id] = p.tricksWon;
    scores[p.id] = p.scoreTotal;
  }

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: p.scoreTotal,
    isOut: false,
    isBot: false,
    isDealer: p.seat === core.dealerIndex,
  }));

  const currentPlayerId =
    core.phase === 'gameOver' ? null : core.players[core.currentPlayerIndex]?.id ?? null;

  const pd: OhHellPublicData = {
    core,
    phase: core.phase,
    currentPlayerId,
    roundNumber: core.roundNumber,
    rounds: core.rounds,
    handSize: core.handSize,
    dealerId: core.players[core.dealerIndex]!.id,
    trumpSuit: core.trumpSuit ? SUIT_TO_PLATFORM[core.trumpSuit] : null,
    turnUpCard: core.turnUpCard ? toPlatformCard(core.turnUpCard, true) : null,
    bids,
    tricksWon,
    scores,
    currentTrick: projectCoreTrickToPlatform(core.currentTrick),
    ledSuit: core.currentTrick?.ledSuit
      ? SUIT_TO_PLATFORM[core.currentTrick.ledSuit]
      : null,
    forbiddenBids: forbiddenBids(core),
    maxBid: core.handSize,
  };

  return {
    version: args.prevVersion + 1,
    roomId,
    gameId,
    phase: core.phase === 'gameOver' ? 'ended' : 'playing',
    players: platformPlayers,
    currentTurn: currentPlayerId,
    turnNumber: core.rounds
      .slice(0, core.roundNumber - 1)
      .reduce((acc, h) => acc + h * core.players.length, 0)
      + core.completedTricksThisRound.length,
    roundNumber: core.roundNumber,
    publicData: pd as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
