/**
 * Euchre — platform engine adapter.
 *
 * Thin wrapper over ./core.ts. The core holds authoritative state and
 * drives a strict phase machine (bidRound1 → bidRound2 → dealerDiscard
 * → play → handOver → gameOver). This adapter translates the
 * frontend's existing action types into core actions, auto-advances
 * between hands, and projects a publicData shape that matches the
 * UI's expectations.
 *
 * Frontend action mapping:
 *   - `bid` with payload { decision: 'pass' | 'orderUp' | 'callTrump', suit?, alone? }
 *   - `discard` with cardIds=[id]  — dealer's pick-up discard
 *   - `play`   with cardIds=[id]
 *   - `ack-hand` — advance to the next hand after handOver
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
  startNextHand as coreStartNextHand,
  DEFAULT_CONFIG,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type EuchreConfig,
} from './core';

const SUIT_TO_PLATFORM: Record<CoreSuit, PlatformSuit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};
const SUIT_TO_CORE: Record<PlatformSuit, CoreSuit> = {
  spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C',
};
const RANK_TO_PLATFORM: Record<CoreRank, PlatformRank> = {
  '9': '9', '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
};
const RANK_NUMERIC: Record<CoreRank, number> = {
  '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
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

interface EuchrePublicData {
  /** Authoritative core state. */
  core: CoreState;
  turnUpCard: PlatformCard | null;
  trumpSuit: PlatformSuit | null;
  trumpCallerId: string | null;
  trumpAlone: boolean;
  currentTrickCards: Array<{ playerId: string; card: PlatformCard }>;
  phase: string;
  /** Cumulative partnership scores. */
  scoreNS: number;
  scoreEW: number;
  handResult: CoreState['handResult'];
  gameWinner: 'NS' | 'EW' | null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export class EuchreEngine implements IGameEngine {
  readonly gameId = 'euchre';
  readonly supportsAsync = false;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 4) {
      throw new Error('Euchre requires exactly 4 players');
    }
    const seed = hashString(roomId);
    const raw =
      ((config.options as Record<string, unknown> | undefined)?.['euchre'] as
        | Partial<EuchreConfig>
        | undefined);
    const coreConfig: EuchreConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    const core = coreNewGame(playerIds, coreConfig, seed);

    logger.debug('EuchreEngine.startGame', { roomId, seed });
    return projectState({
      roomId,
      gameId,
      core,
      turnNumber: 1,
      roundNumber: core.handNumber,
      prevVersion: 0,
    });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as EuchrePublicData;
    let core = pd.core;

    switch (action.type) {
      case 'bid': {
        const decision = (action.payload?.['decision'] as string | undefined) ?? 'pass';
        if (decision === 'pass') {
          core = coreApply(core, { kind: 'bidPass', playerId });
        } else if (decision === 'orderUp') {
          const alone = !!action.payload?.['alone'];
          core = coreApply(core, { kind: 'orderUp', playerId, alone });
        } else if (decision === 'callTrump') {
          const suitPlatform = action.payload?.['suit'] as PlatformSuit | undefined;
          if (!suitPlatform) throw new Error('callTrump requires payload.suit');
          const alone = !!action.payload?.['alone'];
          core = coreApply(core, {
            kind: 'callTrump',
            playerId,
            suit: SUIT_TO_CORE[suitPlatform],
            alone,
          });
        } else {
          throw new Error(`Unknown bid decision: ${decision}`);
        }
        break;
      }
      case 'discard': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 1) throw new Error('Euchre discard requires exactly one card');
        core = coreApply(core, { kind: 'dealerDiscard', playerId, cardId: cardIds[0]! });
        break;
      }
      case 'play': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 1) throw new Error('Euchre play requires exactly one card');
        core = coreApply(core, { kind: 'playCard', playerId, cardId: cardIds[0]! });
        break;
      }
      case 'ack-hand': {
        if (core.phase !== 'handOver') throw new Error('No hand to ack');
        if (!core.gameWinner) core = coreStartNextHand(core);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action.type}`);
    }

    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      core,
      turnNumber: state.turnNumber + 1,
      roundNumber: core.handNumber,
      prevVersion: state.version,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as EuchrePublicData;
    const core = pd.core;
    if (core.phase === 'handOver') {
      if (core.gameWinner) return [];
      return [{ type: 'ack-hand' }];
    }
    if (core.phase === 'gameOver') return [];

    const current = core.players[core.currentPlayerIndex]!;
    if (playerId !== current.id) return [];

    const out: PlayerAction[] = [];
    switch (core.phase) {
      case 'bidRound1':
        out.push({ type: 'bid', payload: { decision: 'pass' } });
        out.push({ type: 'bid', payload: { decision: 'orderUp', alone: false } });
        out.push({ type: 'bid', payload: { decision: 'orderUp', alone: true } });
        break;
      case 'bidRound2': {
        // Mirror the core's stick-the-dealer guard.
        const passCount = core.history.filter((h) => h.kind === 'bidPass').length;
        const isDealer = core.currentPlayerIndex === core.dealerIndex;
        const mustCall =
          isDealer && core.config.stickTheDealer && passCount >= 7;
        if (!mustCall) out.push({ type: 'bid', payload: { decision: 'pass' } });
        const rejectedSuit = core.turnUpCard?.suit;
        for (const s of ['S', 'H', 'D', 'C'] as const) {
          if (s === rejectedSuit) continue;
          out.push({
            type: 'bid',
            payload: {
              decision: 'callTrump',
              suit: SUIT_TO_PLATFORM[s],
              alone: false,
            },
          });
        }
        break;
      }
      case 'dealerDiscard':
        for (const c of current.hand) {
          out.push({ type: 'discard', cardIds: [c.id] });
        }
        break;
      case 'play':
        for (const c of current.hand) {
          out.push({ type: 'play', cardIds: [c.id] });
        }
        break;
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    // Sort by score descending; partnerships rank together.
    const pd = state.publicData as unknown as EuchrePublicData;
    const ns = pd.scoreNS;
    const ew = pd.scoreEW;
    return state.players
      .map((p, idx) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        rank: 0,
        score: idx % 2 === 0 ? ns : ew,
        isBot: p.isBot,
      }))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
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
    score: p.partnership === 'NS' ? core.scores.NS : core.scores.EW,
    isOut: p.sittingOut,
    isBot: false,
  }));

  const publicData: EuchrePublicData = {
    core,
    turnUpCard: core.turnUpCard ? toPlatformCard(core.turnUpCard, true) : null,
    trumpSuit: core.trump ? SUIT_TO_PLATFORM[core.trump.suit] : null,
    trumpCallerId: core.trump?.callerId ?? null,
    trumpAlone: core.trump?.alone ?? false,
    currentTrickCards:
      core.currentTrick?.plays.map((p) => ({
        playerId: p.playerId,
        card: toPlatformCard(p.card, true),
      })) ?? [],
    phase: core.phase,
    scoreNS: core.scores.NS,
    scoreEW: core.scores.EW,
    handResult: core.handResult,
    gameWinner: core.gameWinner,
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
