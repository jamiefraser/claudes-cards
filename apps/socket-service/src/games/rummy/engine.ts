/**
 * Rummy — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Translates the platform's generic
 * PlayerAction shape into the pure core's Action shape and projects
 * a `publicData` contract the frontend expects. The existing frontend
 * relies on:
 *   - `turnPhase` ('draw' | 'discard')
 *   - `drawPile`, `drawPileSize`, `discardPile`, `discardTop`
 *   - `melds`: Array<{ playerId, cards }>
 *
 * Re-exports `isValidMeld` for backwards compatibility with tests that
 * imported it directly from the engine module.
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
  isValidMeld as coreIsValidMeld,
  isSet as coreIsSet,
  isRun as coreIsRun,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type RummyConfig,
  type Meld as CoreMeld,
} from './core';

// ─── Re-exports (backwards compatibility) ──────────────────────────

/**
 * Historical callers (including existing tests) invoke `isValidMeld`
 * with a flat array of platform cards. Wrap the pure-core check so it
 * accepts the platform Card shape and converts internally.
 */
export function isValidMeld(cards: PlatformCard[]): boolean {
  const coreCards = cards.map(platformCardToCore);
  return coreIsValidMeld(coreCards);
}
export { coreIsSet as isSet, coreIsRun as isRun };

// ─── Card translation ──────────────────────────────────────────────

const SUIT_TO_PLATFORM: Record<CoreSuit, PlatformSuit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};
const PLATFORM_TO_SUIT: Record<PlatformSuit, CoreSuit> = {
  spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C',
};
const RANK_TO_PLATFORM: Record<CoreRank, PlatformRank> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K',
};
const PLATFORM_TO_RANK: Partial<Record<PlatformRank, CoreRank>> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K',
};
const RANK_NUMERIC: Record<CoreRank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function toPlatformCard(c: CoreCard, faceUp: boolean): PlatformCard {
  if (c.isJoker) {
    return {
      id: c.id,
      deckType: 'standard',
      suit: 'spades',
      rank: 'A',
      value: 0,
      faceUp,
    };
  }
  return {
    id: c.id,
    deckType: 'standard',
    suit: SUIT_TO_PLATFORM[c.suit!],
    rank: RANK_TO_PLATFORM[c.rank],
    value: RANK_NUMERIC[c.rank],
    faceUp,
  };
}

function platformCardToCore(c: PlatformCard): CoreCard {
  const rank = PLATFORM_TO_RANK[c.rank as PlatformRank];
  if (!rank) throw new Error(`Unknown rank ${c.rank}`);
  return {
    id: c.id,
    rank,
    suit: c.suit ? PLATFORM_TO_SUIT[c.suit as PlatformSuit] : null,
  };
}

// ─── Public-data projection ────────────────────────────────────────

interface RummyPublicData {
  core: CoreState;
  turnPhase: 'draw' | 'discard';
  drawPile: PlatformCard[];
  drawPileSize: number;
  discardPile: PlatformCard[];
  discardTop: PlatformCard | null;
  /** Per-player projection for the legacy UI: { playerId, cards }. */
  melds: Array<{ playerId: string; cards: PlatformCard[]; kind: 'set' | 'run'; meldId: string }>;
  currentPlayerId: string | null;
  drewFromDiscardThisTurn: PlatformCard | null;
  roundNumber: number;
  scores: Record<string, number>;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class RummyEngine implements IGameEngine {
  readonly gameId = 'rummy';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < this.minPlayers || playerIds.length > this.maxPlayers) {
      throw new Error(`Rummy requires ${this.minPlayers}–${this.maxPlayers} players`);
    }
    const seed = hashString(roomId);
    const raw = ((config.options as Record<string, unknown> | undefined)?.['rummy'] as
      | Partial<RummyConfig>
      | undefined);
    const coreCfg: Partial<RummyConfig> = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreCfg, seed);
    logger.debug('RummyEngine.startGame', { roomId, seed, playerCount: playerIds.length });
    return projectState({ roomId, gameId, core, prevVersion: 0 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as RummyPublicData;
    let core = pd.core;
    switch (action.type) {
      case 'draw': {
        const source = (action.payload as { source?: string } | undefined)?.source ?? 'deck';
        if (source === 'discard') {
          core = coreApply(core, { kind: 'drawDiscard', playerId });
        } else {
          core = coreApply(core, { kind: 'drawStock', playerId });
        }
        break;
      }
      case 'meld': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length < 3) throw new Error('meld requires ≥ 3 cardIds');
        // Detect set vs run from the actual cards — the UI doesn't always
        // supply a kind, and the core accepts either as long as it's legal.
        const playerHand = core.players.find((p) => p.id === playerId)?.hand ?? [];
        const cards = cardIds.map((id) => {
          const c = playerHand.find((x) => x.id === id);
          if (!c) throw new Error(`Card ${id} not in hand`);
          return c;
        });
        const kind: 'set' | 'run' = coreIsSet(cards, core.config) ? 'set' : 'run';
        core = coreApply(core, { kind: 'meld', playerId, cardIds, meldKind: kind });
        break;
      }
      case 'layoff':
      case 'lay-off': {
        const p = action.payload as { cardId?: string; targetMeldId?: string } | undefined;
        const cardId = p?.cardId ?? action.cardIds?.[0];
        const targetMeldId = p?.targetMeldId;
        if (!cardId || !targetMeldId) {
          throw new Error('layoff requires cardId + targetMeldId');
        }
        core = coreApply(core, { kind: 'layOff', playerId, cardId, targetMeldId });
        break;
      }
      case 'discard': {
        const cardId = action.cardIds?.[0];
        if (!cardId) throw new Error('discard requires exactly one cardId');
        core = coreApply(core, { kind: 'discard', playerId, cardId });
        break;
      }
      case 'ack-round': {
        core = coreApply(core, { kind: 'ackRound', playerId });
        break;
      }
      case 'pass':
        // Bot fallback — no-op, return unchanged state.
        return state;
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
    const pd = state.publicData as unknown as RummyPublicData;
    const core = pd.core;
    const actions = coreLegalActions(core, playerId);
    const out: PlayerAction[] = [];
    for (const a of actions) {
      if (a.kind === 'drawStock') {
        out.push({ type: 'draw', payload: { source: 'deck' } });
      } else if (a.kind === 'drawDiscard') {
        out.push({ type: 'draw', payload: { source: 'discard' } });
      } else if (a.kind === 'meld') {
        out.push({ type: 'meld', cardIds: a.cardIds });
      } else if (a.kind === 'layOff') {
        out.push({
          type: 'layoff',
          payload: { cardId: a.cardId, targetMeldId: a.targetMeldId },
          cardIds: [a.cardId],
        });
      } else if (a.kind === 'discard') {
        out.push({ type: 'discard', cardIds: [a.cardId] });
      } else if (a.kind === 'ackRound') {
        out.push({ type: 'ack-round' });
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

  const turnPhase: 'draw' | 'discard' =
    core.phase === 'awaitingDraw' ? 'draw' : 'discard';

  const scores: Record<string, number> = {};
  for (const p of core.players) scores[p.id] = p.scoreTotal;

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: p.scoreTotal,
    isOut: false,
    isBot: false,
  }));

  const melds = core.melds.map((m: CoreMeld) => ({
    playerId: m.ownerId,
    cards: m.cards.map((c) => toPlatformCard(c, true)),
    kind: m.kind,
    meldId: m.id,
  }));

  const currentPlayerId =
    core.phase === 'gameOver' || core.phase === 'roundOver'
      ? null
      : core.players[core.currentPlayerIndex]?.id ?? null;

  const pd: RummyPublicData = {
    core,
    turnPhase,
    // Stock contents are private — expose only the count. The `drawPile`
    // field is kept for frontend compatibility but uses an empty array
    // since the pre-existing implementation also did not leak stock ids.
    drawPile: [],
    drawPileSize: core.stock.length,
    discardPile: core.discard.map((c) => toPlatformCard(c, true)),
    discardTop: core.discard.length > 0
      ? toPlatformCard(core.discard[core.discard.length - 1]!, true)
      : null,
    melds,
    currentPlayerId,
    drewFromDiscardThisTurn: core.drewFromDiscardThisTurn
      ? toPlatformCard(core.drewFromDiscardThisTurn, true)
      : null,
    roundNumber: core.roundNumber,
    scores,
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
    publicData: pd as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
