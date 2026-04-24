/**
 * War — platform engine adapter.
 *
 * Thin wrapper around ./core.ts. The pure core holds the authoritative
 * state inside publicData (under `war`) and uses its own Card shape
 * (numeric rank 2..14). This adapter projects the core state back into
 * the platform's PlayerState / GameState shape so the rest of the
 * socket-service (scoring, replay, bot activation, etc.) works without
 * caring that War is a zero-information game.
 *
 * War has no player decisions — the only accepted action is `{ type:
 * 'flip' }`, which advances the core by one `step()`. The GenericBot
 * strategy sends that action on every bot turn.
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerRanking,
  PlayerState,
  Card as PlatformCard,
  Rank as PlatformRank,
  Suit as PlatformSuit,
} from '@card-platform/shared-types';
import { logger } from '../../utils/logger';
import {
  newGame as coreNewGame,
  step as coreStep,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type WarConfig,
} from './core';

const SUIT_TO_PLATFORM: Record<CoreSuit, PlatformSuit> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

const RANK_TO_PLATFORM: Record<CoreRank, PlatformRank> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

function toPlatformCard(c: CoreCard, faceUp: boolean): PlatformCard {
  return {
    id: c.id,
    deckType: 'standard',
    suit: SUIT_TO_PLATFORM[c.suit],
    rank: RANK_TO_PLATFORM[c.rank],
    value: c.rank,
    faceUp,
  };
}

export class WarEngine implements IGameEngine {
  readonly gameId = 'war';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    const count = playerIds.length;
    if (count !== 2 && count !== 3 && count !== 4) {
      throw new Error(`War requires 2–4 players, got ${count}`);
    }

    // Seed from a stable room-derived hash so replays of the same room
    // with the same deal yield identical games. A real scheduler would
    // thread a seed through GameConfig; the platform interface doesn't
    // expose one yet, so derive from roomId.
    const seed = hashString(roomId);
    const warConfig: WarConfig = {
      playerCount: count as 2 | 3 | 4,
      maxTurns: 10000,
      reshuffleMethod: 'shuffle',
      playerIds,
    };
    const core = coreNewGame(warConfig, seed);

    logger.debug('WarEngine.startGame', { roomId, playerCount: count, seed });

    return projectState({ roomId, gameId, players: playerIds, core, turnNumber: 0, roundNumber: 1 });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (action.type !== 'flip') throw new Error(`Unknown action: ${action.type}`);
    // War is simultaneous — any active player's flip advances the core
    // one step. currentTurn is a UI affordance; the core ignores seat
    // ordering for resolution.
    const active = state.players.find((p) => p.playerId === playerId);
    if (!active || active.isOut) throw new Error(`${playerId} is not active`);

    const core = coreFromState(state);
    const next = coreStep(core);

    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      players: state.players.map((p) => p.playerId),
      core: next,
      turnNumber: state.turnNumber + 1,
      roundNumber: state.roundNumber,
      prevVersion: state.version,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.phase === 'ended') return [];
    const p = state.players.find((pp) => pp.playerId === playerId);
    if (!p || p.isOut) return [];
    return [{ type: 'flip' }];
  }

  computeResult(state: GameState): PlayerRanking[] {
    // Rank by total card count (stock + winnings). The core winner is
    // surfaced in publicData, but ranking needs all seats.
    const sorted = [...state.players].sort(
      (a, b) => cardCount(b) - cardCount(a),
    );
    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: cardCount(p),
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }
}

// ─── State projection ───────────────────────────────────────────────

interface WarPublicData {
  /** Serialised core state; the authoritative record of the game. */
  core: CoreState;
  /** Face-up reveal(s) from the last resolved round, for UI. */
  lastBattle: Array<{ playerId: string; card: PlatformCard }>;
  atWar: boolean;
  warDepth: number;
  /** Total cards currently on the table (face-up + spoils). */
  tableCardCount: number;
  /** Winner id when phase === 'ended', else null. */
  winnerId: string | null;
  /** True if the game ended via max-turns safeguard instead of a real win. */
  forcedByMaxTurns: boolean;
}

function cardCount(p: PlayerState): number {
  return p.hand.length;
}

function projectState(args: {
  roomId: string;
  gameId: string;
  players: string[];
  core: CoreState;
  turnNumber: number;
  roundNumber: number;
  prevVersion?: number;
}): GameState {
  const { roomId, gameId, players: ids, core } = args;

  const platformPlayers: PlayerState[] = ids.map((pid) => {
    const core_p = core.players.find((pp) => pp.id === pid);
    // Platform "hand" is the visible per-player pile — we show both
    // stock and winnings merged as face-down cards. Order: stock first
    // (next-to-flip is first), then winnings (further from top).
    const hand: PlatformCard[] = core_p
      ? [
          ...core_p.stock.map((c) => toPlatformCard(c, false)),
          ...core_p.winnings.map((c) => toPlatformCard(c, false)),
        ]
      : [];
    return {
      playerId: pid,
      displayName: pid,
      hand,
      score: hand.length,
      isOut: core_p?.eliminated ?? false,
      isBot: false,
    };
  });

  const faceUps = core.table.entries
    .filter((e) => !e.faceDown)
    .map((e) => ({ playerId: e.playerId, card: toPlatformCard(e.card, true) }));

  const publicData: WarPublicData = {
    core,
    lastBattle: faceUps,
    atWar: core.phase === 'resolvingWar',
    warDepth: core.warDepth,
    tableCardCount: core.table.entries.length,
    winnerId: core.winnerId,
    forcedByMaxTurns: core.forcedByMaxTurns,
  };

  // Pick "currentTurn" as the first non-eliminated player — purely a UI
  // affordance so the turn banner reads right. The core doesn't care.
  const nextActive = platformPlayers.find((p) => !p.isOut);

  return {
    version: (args.prevVersion ?? 0) + 1,
    roomId,
    gameId,
    phase: core.phase === 'gameOver' ? 'ended' : 'playing',
    players: platformPlayers,
    currentTurn: core.phase === 'gameOver' ? null : nextActive?.playerId ?? null,
    turnNumber: args.turnNumber,
    roundNumber: args.roundNumber,
    publicData: publicData as unknown as Record<string, unknown>,
    updatedAt: new Date().toISOString(),
  };
}

function coreFromState(state: GameState): CoreState {
  const pd = state.publicData as unknown as WarPublicData;
  return pd.core;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
