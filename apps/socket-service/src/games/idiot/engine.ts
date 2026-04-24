/**
 * Idiot — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Maps the platform's generic
 * `PlayerAction` shape into the pure core's `Action` shape and projects
 * a UI-friendly `publicData` contract.
 *
 * Supported action types (PlayerAction.type):
 *   - `swap`    : payload { handCardId, faceUpCardId } — swap phase
 *   - `ready`   : no payload — commit swap choices, begin play
 *   - `play`    : cardIds[] — single-zone multi-rank stack (hand/face-up)
 *   - `play-face-down` : cardIds[] (exactly one) — blind play
 *   - `pickup`  : no payload — pick up the entire discard pile
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
  activeZoneOf,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type IdiotConfig,
  type PileRequirement,
  type PlayerState as CorePlayerState,
  type Zone,
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

interface IdiotPublicData {
  /** Core state preserved verbatim so the UI can render any detail. */
  core: CoreState;
  /** UI-friendly projections — duplicated from core for convenience. */
  phase: CoreState['phase'];
  currentPlayerId: string | null;
  discardTop: PlatformCard | null;
  discardCount: number;
  stockCount: number;
  burnedCount: number;
  pileRequirement: PileRequirement;
  /** Per-player projections (all are public). */
  faceUpByPlayer: Record<string, PlatformCard[]>;
  faceDownCountByPlayer: Record<string, number>;
  handCountByPlayer: Record<string, number>;
  readyByPlayer: Record<string, boolean>;
  activeZoneByPlayer: Record<string, Zone | null>;
  finishedOrder: string[];
  firstPlayLowestCardId: string | null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class IdiotEngine implements IGameEngine {
  readonly gameId = 'idiot';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 6) {
      throw new Error('Idiot requires 2–6 players');
    }
    const seed = hashString(roomId);
    const raw = ((config.options as Record<string, unknown> | undefined)?.['idiot'] as
      | Partial<IdiotConfig>
      | undefined);
    const coreCfg: Partial<IdiotConfig> = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreCfg, seed);

    logger.debug('IdiotEngine.startGame', { roomId, seed, playerCount: playerIds.length });
    return projectState({ roomId, gameId, core, prevVersion: 0 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as IdiotPublicData;
    let core = pd.core;

    switch (action.type) {
      case 'swap': {
        const payload = (action as PlayerAction & {
          payload?: { handCardId?: string; faceUpCardId?: string };
        }).payload;
        const handCardId = payload?.handCardId;
        const faceUpCardId = payload?.faceUpCardId;
        if (!handCardId || !faceUpCardId) {
          throw new Error('swap requires handCardId + faceUpCardId payload');
        }
        core = coreApply(core, { kind: 'swap', playerId, handCardId, faceUpCardId });
        break;
      }
      case 'ready': {
        core = coreApply(core, { kind: 'ready', playerId });
        break;
      }
      case 'play': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length === 0) throw new Error('play requires ≥ 1 cardId');
        const current = core.players[core.currentPlayerIndex]!;
        if (current.id !== playerId) throw new Error(`Not ${playerId}'s turn`);
        const zone = activeZoneOf(core, current);
        if (zone === 'hand') {
          core = coreApply(core, { kind: 'playFromHand', playerId, cardIds });
        } else if (zone === 'faceUp') {
          core = coreApply(core, { kind: 'playFromFaceUp', playerId, cardIds });
        } else {
          throw new Error('Cannot `play` from face-down zone — use `play-face-down`');
        }
        break;
      }
      case 'play-face-down': {
        const cardId = action.cardIds?.[0];
        if (!cardId) throw new Error('play-face-down requires exactly one cardId');
        core = coreApply(core, { kind: 'playFromFaceDown', playerId, cardId });
        break;
      }
      case 'pickup': {
        core = coreApply(core, { kind: 'pickUpPile', playerId });
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
    const pd = state.publicData as unknown as IdiotPublicData;
    const core = pd.core;
    const actions = coreLegalActions(core, playerId);
    // Translate core Action → platform PlayerAction. Bot strategies and
    // the UI consume this shape; we keep the set minimal but faithful.
    const out: PlayerAction[] = [];
    for (const a of actions) {
      if (a.kind === 'swap') {
        out.push({
          type: 'swap',
          payload: { handCardId: a.handCardId, faceUpCardId: a.faceUpCardId },
        } as PlayerAction);
      } else if (a.kind === 'ready') {
        out.push({ type: 'ready' });
      } else if (a.kind === 'playFromHand' || a.kind === 'playFromFaceUp') {
        out.push({ type: 'play', cardIds: a.cardIds });
      } else if (a.kind === 'playFromFaceDown') {
        out.push({ type: 'play-face-down', cardIds: [a.cardId] });
      } else if (a.kind === 'pickUpPile') {
        out.push({ type: 'pickup' });
      }
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const pd = state.publicData as unknown as IdiotPublicData;
    const { finishedOrder } = pd.core;
    // Rank finished players in placement order. Any remaining un-finished
    // player is the Idiot, ranked last with the highest numeric rank.
    const placements: Record<string, number> = {};
    finishedOrder.forEach((id, idx) => { placements[id] = idx + 1; });
    const unfinished = pd.core.players
      .filter((p) => p.finishedPlace === null)
      .map((p) => p.id);
    const lastRank = pd.core.players.length;
    unfinished.forEach((id) => { placements[id] = lastRank; });

    return state.players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: placements[p.playerId] ?? lastRank,
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

  const faceUpByPlayer: Record<string, PlatformCard[]> = {};
  const faceDownCountByPlayer: Record<string, number> = {};
  const handCountByPlayer: Record<string, number> = {};
  const readyByPlayer: Record<string, boolean> = {};
  const activeZoneByPlayer: Record<string, Zone | null> = {};
  for (const p of core.players) {
    faceUpByPlayer[p.id] = p.faceUp.map((c) => toPlatformCard(c, true));
    faceDownCountByPlayer[p.id] = p.faceDown.length;
    handCountByPlayer[p.id] = p.hand.length;
    readyByPlayer[p.id] = p.ready;
    activeZoneByPlayer[p.id] = activeZoneOf(core, p);
  }

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: p.finishedPlace ?? 0,
    isOut: p.finishedPlace !== null,
    isBot: false,
  }));

  const currentPlayerId =
    core.phase === 'gameOver'
      ? null
      : core.players[core.currentPlayerIndex]?.id ?? null;

  const publicData: IdiotPublicData = {
    core,
    phase: core.phase,
    currentPlayerId,
    discardTop: core.discard.length > 0
      ? toPlatformCard(core.discard[core.discard.length - 1]!, true)
      : null,
    discardCount: core.discard.length,
    stockCount: core.stock.length,
    burnedCount: core.burned.length,
    pileRequirement: core.pileRequirement,
    faceUpByPlayer,
    faceDownCountByPlayer,
    handCountByPlayer,
    readyByPlayer,
    activeZoneByPlayer,
    finishedOrder: core.finishedOrder,
    firstPlayLowestCardId: core.firstPlayLowestCardId,
  };

  return {
    version: args.prevVersion + 1,
    roomId,
    gameId,
    phase: core.phase === 'gameOver' ? 'ended' : 'playing',
    players: platformPlayers,
    currentTurn: currentPlayerId,
    turnNumber: core.turnNumber,
    roundNumber: core.roundNumber,
    publicData: publicData as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
