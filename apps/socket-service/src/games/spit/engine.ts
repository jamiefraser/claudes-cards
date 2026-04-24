/**
 * Spit (Speed) — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Translates frontend actions (`start`,
 * `play`, `spit`, `slap`, `ack-round`) into the pure core's Action
 * shape and projects a UI-friendly `publicData` contract.
 *
 * Spit is real-time: no turn ownership, both players act freely. The
 * core resolves actions strictly in arrival order via a timestamp
 * supplied by the adapter at each applyAction call.
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
  start as coreStart,
  legalPlays as coreLegalPlays,
  startNextRound as coreStartNextRound,
  DEFAULT_CONFIG,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type SpitConfig,
  type CenterIndex,
  type ColumnIndex,
} from './core';

const SUIT_TO_PLATFORM: Record<CoreSuit, PlatformSuit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};
const RANK_TO_PLATFORM: Record<CoreRank, PlatformRank> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K',
};
const RANK_NUMERIC: Record<CoreRank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
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

interface SpitPublicData {
  core: CoreState;
  phase: CoreState['phase'];
  columnsByPlayer: Record<string, {
    tops: Array<PlatformCard | null>;
    depths: number[];
  }>;
  spitPileCountByPlayer: Record<string, number>;
  centerTops: [PlatformCard | null, PlatformCard | null];
  centerCounts: [number, number];
  spitAvailable: boolean;
  roundNumber: number;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class SpitEngine implements IGameEngine {
  readonly gameId = 'spit';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 2;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 2) throw new Error('Spit requires exactly 2 players');
    const seed = hashString(roomId);
    const raw = ((config.options as Record<string, unknown> | undefined)?.['spit'] as
      | Partial<SpitConfig>
      | undefined);
    const coreCfg: Partial<SpitConfig> = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    let core = coreNewGame(playerIds, coreCfg, seed);
    // Auto-start the first round so the UI doesn't have to submit a
    // separate `start` action — spit piles flip and play begins.
    core = coreStart(core);
    logger.debug('SpitEngine.startGame', { roomId, seed });
    return projectState({ roomId, gameId, core, prevVersion: 0 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as SpitPublicData;
    let core = pd.core;
    const ts = Date.now();
    switch (action.type) {
      case 'play': {
        const payload = action.payload as
          | { columnIndex?: number; centerIndex?: number }
          | undefined;
        const columnIndex = payload?.columnIndex;
        const centerIndex = payload?.centerIndex;
        if (typeof columnIndex !== 'number' || typeof centerIndex !== 'number') {
          throw new Error('play requires numeric columnIndex + centerIndex');
        }
        core = coreApply(core, {
          kind: 'play', playerId,
          columnIndex: columnIndex as ColumnIndex,
          centerIndex: centerIndex as CenterIndex,
        }, ts);
        break;
      }
      case 'spit': {
        core = coreApply(core, { kind: 'spit', playerId }, ts);
        break;
      }
      case 'slap': {
        const payload = action.payload as { centerIndex?: number } | undefined;
        const centerIndex = payload?.centerIndex;
        if (typeof centerIndex !== 'number') {
          throw new Error('slap requires numeric centerIndex');
        }
        core = coreApply(core, {
          kind: 'slap', playerId,
          centerIndex: centerIndex as CenterIndex,
        }, ts);
        break;
      }
      case 'ack-round': {
        if (core.phase !== 'roundOver') throw new Error('No round to ack');
        core = coreStartNextRound(core);
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
    const pd = state.publicData as unknown as SpitPublicData;
    const core = pd.core;
    const out: PlayerAction[] = [];
    for (const a of coreLegalPlays(core, playerId)) {
      if (a.kind === 'play') {
        out.push({
          type: 'play',
          payload: { columnIndex: a.columnIndex, centerIndex: a.centerIndex },
        });
      }
    }
    if (core.spitAvailable) out.push({ type: 'spit' });
    // Slap becomes legal once this player's stockpiles are all empty.
    const player = core.players.find((p) => p.id === playerId);
    if (player && player.columns.every((c) => c.length === 0) && core.phase === 'playing') {
      out.push({ type: 'slap', payload: { centerIndex: 0 } });
      out.push({ type: 'slap', payload: { centerIndex: 1 } });
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const pd = state.publicData as unknown as SpitPublicData;
    const winnerId = pd.core.matchWinnerId ?? pd.core.roundWinnerId;
    return state.players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: winnerId === null ? 1 : p.playerId === winnerId ? 1 : 2,
      score: p.score,
      isBot: p.isBot,
    })).sort((a, b) => a.rank - b.rank);
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

  const columnsByPlayer: SpitPublicData['columnsByPlayer'] = {};
  const spitPileCountByPlayer: Record<string, number> = {};
  for (const p of core.players) {
    columnsByPlayer[p.id] = {
      tops: p.columns.map((c) => {
        const top = c[c.length - 1];
        return top ? toPlatformCard(top, true) : null;
      }),
      depths: p.columns.map((c) => c.length),
    };
    spitPileCountByPlayer[p.id] = p.spitPile.length;
  }

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: [] as PlatformCard[], // Spit doesn't use a traditional hand — columns are the layout
    score: p.columns.reduce((s, c) => s + c.length, 0),
    isOut: p.outOfMatch,
    isBot: false,
  }));

  const pd: SpitPublicData = {
    core,
    phase: core.phase,
    columnsByPlayer,
    spitPileCountByPlayer,
    centerTops: [
      core.centerPiles[0][core.centerPiles[0].length - 1]
        ? toPlatformCard(core.centerPiles[0][core.centerPiles[0].length - 1]!, true) : null,
      core.centerPiles[1][core.centerPiles[1].length - 1]
        ? toPlatformCard(core.centerPiles[1][core.centerPiles[1].length - 1]!, true) : null,
    ],
    centerCounts: [core.centerPiles[0].length, core.centerPiles[1].length],
    spitAvailable: core.spitAvailable,
    roundNumber: core.roundNumber,
    roundWinnerId: core.roundWinnerId,
    matchWinnerId: core.matchWinnerId,
  };

  return {
    version: args.prevVersion + 1,
    roomId,
    gameId,
    phase: core.phase === 'matchOver' ? 'ended' : 'playing',
    players: platformPlayers,
    // Spit is real-time: there is no "current turn". We surface null
    // here — the UI ignores `currentTurn` and enables actions for both.
    currentTurn: null,
    turnNumber: core.actionLog.length + 1,
    roundNumber: core.roundNumber,
    publicData: pd as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
