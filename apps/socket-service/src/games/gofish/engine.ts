/**
 * Go Fish — platform engine adapter.
 *
 * Thin wrapper around ./core.ts. Frontend sends `ask` actions with
 * payload `{ targetPlayerId, rank }`; the adapter translates into the
 * core's `Action` shape. Core-produced history entries (`fish`,
 * `bookLaid`, `autoDraw`, `turnPass`) surface via publicData.core.
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
  DEFAULT_CONFIG,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type GoFishConfig,
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

interface GoFishPublicData {
  core: CoreState;
  stockCount: number;
  /** Per-player book list for UI. */
  books: Record<string, string[]>;
  /** Ask history trimmed to a UI-friendly shape. */
  askLog: Array<{
    askerId: string;
    targetId: string;
    rank: string;
    outcome: 'received' | 'fish' | 'luckyFish';
  }>;
  phase: string;
  winnerIds: string[];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class GoFishEngine implements IGameEngine {
  readonly gameId = 'gofish';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 6) {
      throw new Error('Go Fish requires 2–6 players');
    }
    const seed = hashString(roomId);
    const raw =
      ((config.options as Record<string, unknown> | undefined)?.['goFish'] as
        | Partial<GoFishConfig>
        | undefined);
    const coreConfig: GoFishConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreConfig, seed);

    logger.debug('GoFishEngine.startGame', { roomId, seed });
    return projectState({
      roomId,
      gameId,
      core,
      turnNumber: core.turnNumber,
      roundNumber: 1,
      prevVersion: 0,
    });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as GoFishPublicData;
    let core = pd.core;

    switch (action.type) {
      case 'ask': {
        const targetId = action.payload?.['targetPlayerId'] as string | undefined;
        const rank = action.payload?.['rank'] as string | undefined;
        if (!targetId || !rank) throw new Error('ask requires payload.targetPlayerId and payload.rank');
        core = coreApply(core, {
          kind: 'ask',
          askerId: playerId,
          targetId,
          rank: rank as CoreRank,
        });
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
      roundNumber: state.roundNumber,
      prevVersion: state.version,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as GoFishPublicData;
    const core = pd.core;
    if (core.phase === 'gameOver') return [];
    const current = core.players[core.currentPlayerIndex]!;
    if (playerId !== current.id) return [];
    if (current.hand.length === 0) {
      // Engine auto-draws when the player acts; no manual actions.
      return [];
    }
    const heldRanks = new Set<string>();
    for (const c of current.hand) heldRanks.add(c.rank);
    const out: PlayerAction[] = [];
    for (const t of core.players) {
      if (t.id === current.id || t.hand.length === 0) continue;
      for (const r of heldRanks) {
        out.push({ type: 'ask', payload: { targetPlayerId: t.id, rank: r } });
      }
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const pd = state.publicData as unknown as GoFishPublicData;
    const books = pd.books;
    const sorted = [...state.players].sort(
      (a, b) => (books[b.playerId]?.length ?? 0) - (books[a.playerId]?.length ?? 0),
    );
    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: books[p.playerId]?.length ?? 0,
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
    score: p.books.length,
    isOut: p.hand.length === 0 && core.stock.length === 0,
    isBot: false,
  }));

  const books: Record<string, string[]> = {};
  for (const p of core.players) books[p.id] = [...p.books];

  const askLog: GoFishPublicData['askLog'] = [];
  for (let i = 0; i < core.history.length; i++) {
    const a = core.history[i]!;
    if (a.kind !== 'ask') continue;
    // Scan forward for the paired fish / transfer outcome.
    const next = core.history[i + 1];
    if (!next) continue;
    if (next.kind === 'fish') {
      askLog.push({
        askerId: a.askerId,
        targetId: a.targetId,
        rank: a.rank,
        outcome: next.matched ? 'luckyFish' : 'fish',
      });
    } else {
      // Non-fish follow-up means the target handed cards over.
      askLog.push({
        askerId: a.askerId,
        targetId: a.targetId,
        rank: a.rank,
        outcome: 'received',
      });
    }
  }

  const publicData: GoFishPublicData = {
    core,
    stockCount: core.stock.length,
    books,
    askLog,
    phase: core.phase,
    winnerIds: core.winnerIds,
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
