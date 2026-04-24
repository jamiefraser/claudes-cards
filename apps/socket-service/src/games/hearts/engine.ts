/**
 * Hearts — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Translates frontend actions
 * (`pass` / `play` / `ack-round`) into the pure core's Action shape
 * and projects a publicData contract that the existing Hearts Pass-3
 * UI expects: `turnPhase` ('pass' | 'play'), `heartsBroken`,
 * `currentTrick`, `roundScores`.
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
  startNextRound as coreStartNextRound,
  DEFAULT_CONFIG,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type HeartsConfig,
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

interface HeartsPublicData {
  core: CoreState;
  turnPhase: 'pass' | 'play';
  heartsBroken: boolean;
  passDirection: string;
  currentTrickCards: Array<{ playerId: string; card: PlatformCard }>;
  scoresTotal: Record<string, number>;
  roundResult: CoreState['roundResult'];
  gameWinnerIds: string[];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class HeartsEngine implements IGameEngine {
  readonly gameId = 'hearts';
  readonly supportsAsync = false;
  readonly minPlayers = 3;
  readonly maxPlayers = 7;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 3 || playerIds.length > 7) {
      throw new Error('Hearts requires 3–7 players');
    }
    const seed = hashString(roomId);
    const raw =
      ((config.options as Record<string, unknown> | undefined)?.['hearts'] as
        | Partial<HeartsConfig>
        | undefined);
    const coreConfig: HeartsConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreConfig, seed);

    logger.debug('HeartsEngine.startGame', { roomId, seed, playerCount: playerIds.length });
    return projectState({
      roomId, gameId, core,
      turnNumber: core.turnNumber,
      roundNumber: core.roundNumber,
      prevVersion: 0,
    });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as HeartsPublicData;
    let core = pd.core;

    switch (action.type) {
      case 'pass': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 3) throw new Error('Hearts pass requires exactly 3 cards');
        core = coreApply(core, { kind: 'selectPass', playerId, cardIds });
        break;
      }
      case 'play': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 1) throw new Error('Hearts play requires exactly one card');
        core = coreApply(core, { kind: 'playCard', playerId, cardId: cardIds[0]! });
        break;
      }
      case 'ack-round': {
        if (core.phase !== 'roundOver') throw new Error('No round to ack');
        if (!core.gameWinnerIds.length) core = coreStartNextRound(core);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action.type}`);
    }

    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      core,
      turnNumber: core.turnNumber,
      roundNumber: core.roundNumber,
      prevVersion: state.version,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as HeartsPublicData;
    const core = pd.core;
    if (core.phase === 'roundOver') {
      if (core.gameWinnerIds.length) return [];
      return [{ type: 'ack-round' }];
    }
    if (core.phase === 'gameOver') return [];

    const player = core.players.find((p) => p.id === playerId);
    if (!player) return [];

    if (core.phase === 'pass') {
      if (player.pendingPass !== null) return [];
      // Enumerate is expensive; surface per-card "pass-candidate" actions
      // for the UI to compose a 3-card selection client-side.
      const out: PlayerAction[] = [];
      for (const c of player.hand) {
        out.push({ type: 'pass-candidate', cardIds: [c.id] });
      }
      return out;
    }

    // Play phase.
    const current = core.players[core.currentPlayerIndex]!;
    if (playerId !== current.id) return [];

    // Reuse core's legalPlays indirectly via coreApply error-checking.
    // Build options from hand, filtered.
    const out: PlayerAction[] = [];
    for (const c of player.hand) {
      out.push({ type: 'play', cardIds: [c.id] });
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    // Lowest score wins.
    const sorted = [...state.players].sort((a, b) => a.score - b.score);
    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: p.score,
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }
}

function projectState(args: {
  roomId: string;
  gameId: string;
  core: CoreState;
  turnNumber: number;
  roundNumber: number;
  prevVersion: number;
}): GameState {
  const { roomId, gameId, core } = args;

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: p.scoreTotal,
    isOut: false,
    isBot: false,
  }));

  const scoresTotal: Record<string, number> = {};
  for (const p of core.players) scoresTotal[p.id] = p.scoreTotal;

  const publicData: HeartsPublicData = {
    core,
    turnPhase: core.phase === 'pass' ? 'pass' : 'play',
    heartsBroken: core.heartsBroken,
    passDirection: core.passDirection,
    currentTrickCards:
      core.currentTrick?.plays.map((pl) => ({
        playerId: pl.playerId,
        card: toPlatformCard(pl.card, true),
      })) ?? [],
    scoresTotal,
    roundResult: core.roundResult,
    gameWinnerIds: core.gameWinnerIds,
  };

  const currentPlayerId =
    core.phase === 'gameOver'
      ? null
      : platformPlayers[core.currentPlayerIndex]?.playerId ?? null;

  return {
    version: args.prevVersion + 1,
    roomId,
    gameId,
    phase: core.phase === 'gameOver' ? 'ended' : 'playing',
    players: platformPlayers,
    currentTurn: currentPlayerId,
    turnNumber: args.turnNumber,
    roundNumber: args.roundNumber,
    publicData: publicData as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
