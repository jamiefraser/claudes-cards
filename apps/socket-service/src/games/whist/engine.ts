/**
 * Whist — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Maps `play` / `ack-hand` action types
 * and projects a publicData contract compatible with the existing
 * frontend (`trumpSuit`, `tricksTaken`, `teamScores`, `currentTrick`,
 * `ledSuit`) plus spec-added fields (`turnUpCard`, `partnerships`,
 * `dealerIndex`, `roundNumber`).
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
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type WhistConfig,
  type Partnership,
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
    value: RANK_NUMERIC[c.rank],
    faceUp,
  };
}

interface WhistPublicData {
  core: CoreState;
  trumpSuit: PlatformSuit | null;
  turnUpCard: PlatformCard | null;
  currentTrick: Array<{ playerId: string; card: PlatformCard }>;
  ledSuit: PlatformSuit | null;
  tricksTaken: Record<string, number>;
  teamScores: Record<string, number>;
  partnerships: Partnership[];
  dealerIndex: number;
  roundNumber: number;
  phase: CoreState['phase'];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class WhistEngine implements IGameEngine {
  readonly gameId = 'whist';
  readonly supportsAsync = false;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 4) throw new Error('Whist requires exactly 4 players');
    const seed = hashString(roomId);
    const raw = ((config.options as Record<string, unknown> | undefined)?.['whist'] as
      | Partial<WhistConfig>
      | undefined);
    const coreCfg: Partial<WhistConfig> = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreCfg, seed);
    logger.debug('WhistEngine.startGame', {
      roomId, seed, trumpSuit: core.trumpSuit,
    });
    return projectState({ roomId, gameId, core, prevVersion: 0 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as WhistPublicData;
    let core = pd.core;
    switch (action.type) {
      case 'play': {
        const cardId = action.cardIds?.[0];
        if (!cardId) throw new Error('play requires exactly one cardId');
        core = coreApply(core, { kind: 'playCard', playerId, cardId });
        break;
      }
      case 'ack-hand':
      case 'ack-round': {
        core = coreApply(core, { kind: 'ackHand', playerId });
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
    const pd = state.publicData as unknown as WhistPublicData;
    const core = pd.core;
    const actions = coreLegalActions(core, playerId);
    const out: PlayerAction[] = [];
    for (const a of actions) {
      if (a.kind === 'playCard') {
        out.push({ type: 'play', cardIds: [a.cardId] });
      } else if (a.kind === 'ackHand') {
        out.push({ type: 'ack-hand' });
      }
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
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

function projectState(args: {
  roomId: string;
  gameId: string;
  core: CoreState;
  prevVersion: number;
}): GameState {
  const { roomId, gameId, core } = args;

  const tricksTaken: Record<string, number> = {};
  // Whist tracks tricks at the partnership level; surface both the
  // partnership counter (NS/EW/teamA/teamB) and a per-player split
  // inferred from each trick's winner for legacy UI compatibility.
  const perPlayer: Record<string, number> = {};
  for (const t of core.completedTricks) {
    if (t.winnerId) perPlayer[t.winnerId] = (perPlayer[t.winnerId] ?? 0) + 1;
  }
  for (const p of core.players) tricksTaken[p.id] = perPlayer[p.id] ?? 0;

  const ns = core.partnerships.find((pa) => pa.id === 'NS')!;
  const ew = core.partnerships.find((pa) => pa.id === 'EW')!;
  const teamScores: Record<string, number> = {
    teamA: ns.score,
    teamB: ew.score,
    NS: ns.score,
    EW: ew.score,
  };

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: (p.partnershipId === 'NS' ? ns : ew).score,
    isOut: false,
    isBot: false,
    isDealer: p.seat === core.dealerIndex,
  }));

  const currentPlayerId =
    core.phase === 'gameOver' || core.phase === 'handOver'
      ? null
      : core.players[core.currentPlayerIndex]?.id ?? null;

  const pd: WhistPublicData = {
    core,
    trumpSuit: core.trumpSuit ? SUIT_TO_PLATFORM[core.trumpSuit] : null,
    turnUpCard: core.turnUpCard ? toPlatformCard(core.turnUpCard, true) : null,
    currentTrick: core.currentTrick?.plays.map((pl) => ({
      playerId: pl.playerId,
      card: toPlatformCard(pl.card, true),
    })) ?? [],
    ledSuit: core.currentTrick?.ledSuit ? SUIT_TO_PLATFORM[core.currentTrick.ledSuit] : null,
    tricksTaken,
    teamScores,
    partnerships: core.partnerships,
    dealerIndex: core.dealerIndex,
    roundNumber: core.roundNumber,
    phase: core.phase,
  };

  return {
    version: args.prevVersion + 1,
    roomId,
    gameId,
    phase: core.phase === 'gameOver' ? 'ended' : 'playing',
    players: platformPlayers,
    currentTurn: currentPlayerId,
    turnNumber: core.completedTricks.length + 1,
    roundNumber: core.roundNumber,
    publicData: pd as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
