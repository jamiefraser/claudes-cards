/**
 * Spades — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. Translates frontend actions (`bid`,
 * `play`, `ack-round`) into the pure core's Action shape and projects
 * a UI-friendly `publicData` contract.
 *
 * Preserves the legacy public-data fields for frontend compatibility:
 *   - `gamePhase` ('bidding' | 'playing' | 'scoring')
 *   - `bids` (Record<playerId, number>) — nil bids surface as 0, blind
 *     nils as -1 so the UI can render them differently if desired
 *   - `tricksTaken` per player
 *   - `spadesBroken`, `teamScores`, `dealerIndex`, `currentTrick`,
 *     `ledSuit`
 *
 * Adds canonical spec fields: `partnerships`, `sandbags`, `roundNumber`.
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
  type SpadesConfig,
  type Bid,
  type PartnershipId,
} from './core';

const SUIT_TO_PLATFORM: Record<CoreSuit, PlatformSuit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};
const RANK_TO_PLATFORM: Partial<Record<CoreRank, PlatformRank>> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};
const RANK_NUMERIC: Record<CoreRank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
  LittleJoker: 15, BigJoker: 16,
};

function toPlatformCard(c: CoreCard, faceUp: boolean): PlatformCard {
  return {
    id: c.id,
    deckType: 'standard',
    suit: SUIT_TO_PLATFORM[c.suit],
    // Jokers don't have a platform rank — surface as 'A' but use the
    // numeric value to distinguish. The UI can key off the card id.
    rank: RANK_TO_PLATFORM[c.rank] ?? 'A',
    value: RANK_NUMERIC[c.rank],
    faceUp,
  };
}

/** Project a core Bid into the legacy { [playerId]: number } shape.
 *  nil → 0; blindNil → -1; unset → -2. */
function bidToLegacyNumber(bid: Bid | null): number {
  if (!bid) return -2;
  if (bid.kind === 'nil') return 0;
  if (bid.kind === 'blindNil') return -1;
  return bid.n;
}

interface SpadesPublicData {
  core: CoreState;
  gamePhase: 'bidding' | 'playing' | 'scoring';
  bids: Record<string, number>;
  bidKinds: Record<string, Bid['kind'] | null>;
  tricksTaken: Record<string, number>;
  currentTrick: Array<{ playerId: string; card: PlatformCard }>;
  ledSuit: PlatformSuit | null;
  spadesBroken: boolean;
  teamScores: Record<string, number>;
  sandbags: Record<string, number>;
  dealerIndex: number;
  roundNumber: number;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class SpadesEngine implements IGameEngine {
  readonly gameId = 'spades';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 4) {
      throw new Error('Spades requires 2–4 players');
    }
    const seed = hashString(roomId);
    const raw = ((config.options as Record<string, unknown> | undefined)?.['spades'] as
      | Partial<SpadesConfig>
      | undefined);
    const coreCfg: Partial<SpadesConfig> = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreCfg, seed);
    logger.debug('SpadesEngine.startGame', { roomId, seed, playerCount: playerIds.length });
    return projectState({ roomId, gameId, core, prevVersion: 0 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as SpadesPublicData;
    let core = pd.core;
    switch (action.type) {
      case 'bid': {
        const amount = (action.payload as { amount?: number; bidKind?: string } | undefined)?.amount;
        const kind = (action.payload as { bidKind?: Bid['kind'] } | undefined)?.bidKind;
        let bid: Bid;
        if (kind === 'nil' || amount === 0) {
          // Legacy callers send amount=0 to mean nil. Per spec these are
          // different, but for back-compat we treat 0 as nil.
          bid = amount === 0 && kind === undefined ? { kind: 'nil' } : { kind: kind ?? 'nil' } as Bid;
          if (kind === 'blindNil') bid = { kind: 'blindNil' };
        } else {
          if (typeof amount !== 'number') throw new Error('bid requires numeric amount');
          bid = { kind: 'number', n: amount };
        }
        core = coreApply(core, { kind: 'placeBid', playerId, bid });
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
    const pd = state.publicData as unknown as SpadesPublicData;
    const core = pd.core;
    const actions = coreLegalActions(core, playerId);
    const out: PlayerAction[] = [];
    for (const a of actions) {
      if (a.kind === 'placeBid') {
        if (a.bid.kind === 'number') {
          out.push({ type: 'bid', payload: { amount: a.bid.n } });
        } else if (a.bid.kind === 'nil') {
          out.push({ type: 'bid', payload: { amount: 0, bidKind: 'nil' } });
        } else {
          out.push({ type: 'bid', payload: { bidKind: 'blindNil' } });
        }
      } else if (a.kind === 'playCard') {
        out.push({ type: 'play', cardIds: [a.cardId] });
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

  const bids: Record<string, number> = {};
  const bidKinds: Record<string, Bid['kind'] | null> = {};
  const tricksTaken: Record<string, number> = {};
  for (const p of core.players) {
    bids[p.id] = bidToLegacyNumber(p.bid);
    bidKinds[p.id] = p.bid?.kind ?? null;
    tricksTaken[p.id] = p.tricksTakenCount;
  }

  // Legacy teamScores shape: 4p emits teamA/teamB; 2p/3p emits per-player.
  const teamScores: Record<string, number> = {};
  const sandbags: Record<string, number> = {};
  if (core.partnerships.length === 2) {
    const ns = core.partnerships.find((p) => p.id === 'NS')!;
    const ew = core.partnerships.find((p) => p.id === 'EW')!;
    teamScores.teamA = ns.score;
    teamScores.teamB = ew.score;
    teamScores.NS = ns.score;
    teamScores.EW = ew.score;
    sandbags.teamA = ns.sandbags;
    sandbags.teamB = ew.sandbags;
    sandbags.NS = ns.sandbags;
    sandbags.EW = ew.sandbags;
  } else {
    for (const pa of core.partnerships) {
      teamScores[pa.id] = pa.score;
      sandbags[pa.id] = pa.sandbags;
    }
  }

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: partnershipScoreFor(p.id, p.partnershipId, core) ?? 0,
    isOut: false,
    isBot: false,
    isDealer: p.seat === core.dealerIndex,
  }));

  const gamePhase: 'bidding' | 'playing' | 'scoring' =
    core.phase === 'bid' ? 'bidding' :
    core.phase === 'play' ? 'playing' : 'scoring';

  const currentPlayerId =
    core.phase === 'gameOver' || core.phase === 'roundOver'
      ? null
      : (core.players[core.currentPlayerIndex]?.id ?? null);

  const pd: SpadesPublicData = {
    core,
    gamePhase,
    bids,
    bidKinds,
    tricksTaken,
    currentTrick: core.currentTrick?.plays.map((pl) => ({
      playerId: pl.playerId,
      card: toPlatformCard(pl.card, true),
    })) ?? [],
    ledSuit: core.currentTrick?.ledSuit ? SUIT_TO_PLATFORM[core.currentTrick.ledSuit] : null,
    spadesBroken: core.spadesBroken,
    teamScores,
    sandbags,
    dealerIndex: core.dealerIndex,
    roundNumber: core.roundNumber,
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

function partnershipScoreFor(
  playerId: string,
  partnershipId: PartnershipId | null,
  core: CoreState,
): number | null {
  if (partnershipId) {
    return core.partnerships.find((pa) => pa.id === partnershipId)?.score ?? 0;
  }
  // Individual play — the partnerships array keys each player as their own team.
  return core.partnerships.find((pa) => pa.id === (playerId as unknown as PartnershipId))?.score ?? 0;
}
