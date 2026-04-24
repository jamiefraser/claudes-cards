/**
 * Crazy Eights — platform engine adapter.
 *
 * Thin wrapper around ./core.ts. The pure core holds the authoritative
 * state inside publicData (under `core`). This adapter projects the
 * core state back into the platform's PlayerState / GameState shape and
 * bridges the frontend's combined "play + declare suit" action (a
 * single `play` action with `payload.suit`) into the core's strict
 * two-step sequence (`play` → `declareSuit`). The action log in
 * publicData.core.history always shows both entries, per spec §11.
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
  legalActions as coreLegal,
  startNextRound as coreStartNextRound,
  DEFAULT_CONFIG,
  DEFAULT_ACTION_CARDS,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type CrazyEightsConfig,
  type Action as CoreAction,
  type ActionCardConfig,
} from './core';

const CORE_TO_PLATFORM_SUIT: Record<CoreSuit, PlatformSuit> = {
  S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs',
};
const PLATFORM_TO_CORE_SUIT: Record<PlatformSuit, CoreSuit> = {
  spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C',
};
const CORE_TO_PLATFORM_RANK: Record<CoreRank, PlatformRank> = {
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
    suit: CORE_TO_PLATFORM_SUIT[c.suit],
    rank: CORE_TO_PLATFORM_RANK[c.rank],
    value: RANK_NUMERIC[c.rank],
    faceUp,
  };
}

interface CrazyEightsPublicData {
  /** Authoritative core state — serialisable, deterministic. */
  core: CoreState;
  /** Legacy field used by the frontend suit-picker UI. */
  declaredSuit: PlatformSuit | null;
  /** Top of the discard pile, projected for rendering. */
  discardTop: PlatformCard | null;
  /** Full discard pile (platform cards). */
  discardPile: PlatformCard[];
  /** Remaining stock as a count — the UI only renders a card back. */
  drawPileSize: number;
  /** 2-draw-2 stack total that the next responder must absorb. */
  pendingDrawPenalty: number;
  /** Set when the round blocks (§9). */
  blocked: boolean;
  /** Round / game winners for end-of-round UI. */
  roundWinnerId: string | null;
  gameWinnerId: string | null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

function resolveConfig(input?: Partial<CrazyEightsConfig>): CrazyEightsConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(input ?? {}),
    actionCards: {
      ...DEFAULT_ACTION_CARDS,
      ...(input?.actionCards ?? {}),
    },
  };
}

export class CrazyEightsEngine implements IGameEngine {
  readonly gameId = 'crazyeights';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 7;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 7) {
      throw new Error('Crazy Eights requires 2–7 players');
    }

    const seed = hashString(roomId);
    const rawConfig =
      ((config.options as Record<string, unknown> | undefined)?.['crazyEights'] as
        | Partial<CrazyEightsConfig>
        | undefined) ?? undefined;
    const coreConfig = resolveConfig(rawConfig);
    const core = coreNewGame(playerIds, coreConfig, seed);

    logger.debug('CrazyEightsEngine.startGame', {
      roomId,
      playerCount: playerIds.length,
      deckCount: core.deckCount,
    });

    return projectState({
      roomId,
      gameId,
      core,
      turnNumber: 0,
      roundNumber: core.roundNumber,
      prevVersion: 0,
    });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as CrazyEightsPublicData;
    let core = pd.core;

    switch (action.type) {
      case 'play': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 1) {
          throw new Error('Crazy Eights accepts exactly one card per play');
        }
        const cardId = cardIds[0]!;
        core = coreApply(core, { kind: 'play', playerId, cardId });
        // If the played card was an 8 the core is now awaitingSuitChoice.
        // The UI's suit picker sends `payload.suit` in the same action, so
        // we fold the declareSuit into this single adapter call.
        if (core.phase === 'awaitingSuitChoice') {
          const rawSuit = (action.payload?.['suit'] as PlatformSuit | undefined);
          if (!rawSuit) throw new Error('Must declare a suit when playing an 8');
          const suit = PLATFORM_TO_CORE_SUIT[rawSuit];
          core = coreApply(core, { kind: 'declareSuit', playerId, suit });
        }
        break;
      }
      case 'declareSuit': {
        const rawSuit = (action.payload?.['suit'] as PlatformSuit | undefined);
        if (!rawSuit) throw new Error('declareSuit requires payload.suit');
        core = coreApply(core, { kind: 'declareSuit', playerId, suit: PLATFORM_TO_CORE_SUIT[rawSuit] });
        break;
      }
      case 'draw': {
        core = coreApply(core, { kind: 'draw', playerId });
        break;
      }
      case 'pass': {
        core = coreApply(core, { kind: 'pass', playerId });
        break;
      }
      default:
        throw new Error(`Unknown action: ${action.type}`);
    }

    // Auto-advance to the next round if the current one ended and the
    // game isn't over. A real production flow would gate this behind
    // player acks, but for parity with the previous adapter's one-round
    // model we terminate on round over.
    const isRoundOver = core.phase === 'roundOver';
    const isGameOver = core.phase === 'gameOver';

    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      core,
      turnNumber: core.turnNumber,
      roundNumber: core.roundNumber,
      prevVersion: state.version,
      ended: isRoundOver || isGameOver,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as CrazyEightsPublicData;
    const legal = coreLegal(pd.core, playerId);
    // Fold each core action into the platform's action shape.
    return legal.map((a): PlayerAction => {
      switch (a.kind) {
        case 'play': return { type: 'play', cardIds: [a.cardId] };
        case 'declareSuit': return { type: 'declareSuit', payload: { suit: CORE_TO_PLATFORM_SUIT[a.suit] } };
        case 'draw': return { type: 'draw' };
        case 'pass': return { type: 'pass' };
        case 'reshuffle': return { type: 'reshuffle' };
      }
    });
  }

  computeResult(state: GameState): PlayerRanking[] {
    // penaltyAccumulation default — lowest score wins.
    // winnerTakesPoints — highest score wins; adapt by reading core config.
    const pd = state.publicData as unknown as CrazyEightsPublicData;
    const mode = pd.core.config.scoringMode;
    const sorted = [...state.players].sort((a, b) =>
      mode === 'winnerTakesPoints' ? b.score - a.score : a.score - b.score,
    );
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

  /** Adapter-only helper: start the next round when the previous ended. */
  advanceToNextRound(state: GameState): GameState {
    const pd = state.publicData as unknown as CrazyEightsPublicData;
    if (pd.core.phase !== 'roundOver') return state;
    const nextCore = coreStartNextRound(pd.core);
    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      core: nextCore,
      turnNumber: nextCore.turnNumber,
      roundNumber: nextCore.roundNumber,
      prevVersion: state.version,
    });
  }
}

// ─── State projection ───────────────────────────────────────────────

function projectState(args: {
  roomId: string;
  gameId: string;
  core: CoreState;
  turnNumber: number;
  roundNumber: number;
  prevVersion: number;
  ended?: boolean;
}): GameState {
  const { roomId, gameId, core } = args;

  const discardPile = core.discard.map((c) => toPlatformCard(c, true));
  const discardTop = discardPile[discardPile.length - 1] ?? null;

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: p.scoreTotal,
    isOut: p.hand.length === 0 && core.phase === 'roundOver',
    isBot: false,
  }));

  const activeSuitPlatform: PlatformSuit = CORE_TO_PLATFORM_SUIT[core.activeSuit];
  // When the top card is an 8 (real wild), declaredSuit carries the
  // currently active suit so the UI can render the overlay. Otherwise
  // declaredSuit is null — activeSuit equals the top card's suit.
  const top = discardTop;
  const declaredSuit: PlatformSuit | null =
    top?.rank === '8' ? activeSuitPlatform : null;

  const publicData: CrazyEightsPublicData = {
    core,
    declaredSuit,
    discardTop,
    discardPile,
    drawPileSize: core.stock.length,
    pendingDrawPenalty: core.pendingDrawPenalty,
    blocked: core.blocked,
    roundWinnerId: core.roundWinnerId,
    gameWinnerId: core.gameWinnerId,
  };

  const phaseEnded =
    args.ended || core.phase === 'gameOver' || core.phase === 'roundOver';
  const currentPlayerId =
    phaseEnded ? null : platformPlayers[core.currentPlayerIndex]?.playerId ?? null;

  return {
    version: args.prevVersion + 1,
    roomId,
    gameId,
    phase: phaseEnded ? 'ended' : 'playing',
    players: platformPlayers,
    currentTurn: currentPlayerId,
    turnNumber: args.turnNumber,
    roundNumber: args.roundNumber,
    publicData: publicData as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}
