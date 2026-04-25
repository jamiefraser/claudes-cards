/**
 * Gin Rummy — platform engine adapter.
 *
 * Thin wrapper around ./core.ts. The pure core holds the authoritative
 * state inside publicData.core and drives a strict phase machine:
 *   firstTurnOffer → firstTurnOfferDealer → awaitingDraw
 *   → awaitingKnockOrDiscard → (awaitingLayoff) → roundOver → gameOver
 *
 * This adapter:
 *   - Seeds from hashString(roomId) for deterministic dealing.
 *   - Accepts the frontend's simpler action types (`draw` with source,
 *     `discard`, `knock`, `gin`, `bigGin`, `ack-show`) and translates
 *     them into core actions.
 *   - Auto-resolves the awaitingLayoff phase by having the defender
 *     lay off every card they legally can, then finalising — so the
 *     existing UI (which doesn't yet support interactive layoff) sees
 *     a single showdown modal with the end result.
 *   - Projects a publicData shape that matches the UI's expectations:
 *     `turnPhase`, `showdown` (with per-player melds / deadwood /
 *     laidOff), `discardTop`, `drawPileSize`.
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
  computeOptimalMeldingPartition,
  startNextRound as coreStartNextRound,
  DEFAULT_CONFIG,
  type Card as CoreCard,
  type GameState as CoreState,
  type Suit as CoreSuit,
  type Rank as CoreRank,
  type GinRummyConfig,
  type Meld as CoreMeld,
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

// ─── Showdown projection ────────────────────────────────────────────

interface ShowdownPlayer {
  playerId: string;
  displayName: string;
  isBot: boolean;
  melds: PlatformCard[][];
  deadwood: PlatformCard[];
  deadwoodPts: number;
  laidOff: PlatformCard[];
}

interface ShowdownData {
  active: boolean;
  acked: string[];
  knockerId: string;
  isGin: boolean;
  isBigGin: boolean;
  isUndercut: boolean;
  knockerPts: number;
  oppPts: number;
  players: ShowdownPlayer[];
}

interface GinRummyPublicData {
  /** Authoritative core state. */
  core: CoreState;
  discardTop: PlatformCard | null;
  drawPileSize: number;
  turnPhase: 'draw' | 'discard';
  showdown: ShowdownData | null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

function resolveConfig(input?: Partial<GinRummyConfig>): GinRummyConfig {
  return { ...DEFAULT_CONFIG, ...(input ?? {}) };
}

export class GinRummyEngine implements IGameEngine {
  readonly gameId = 'ginrummy';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 2;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 2) {
      throw new Error('Gin Rummy requires exactly 2 players');
    }

    const seed = hashString(roomId);
    const raw =
      ((config.options as Record<string, unknown> | undefined)?.['ginRummy'] as
        | Partial<GinRummyConfig>
        | undefined);
    const coreConfig = resolveConfig(raw);
    const core = coreNewGame(playerIds, coreConfig, seed);

    logger.debug('GinRummyEngine.startGame', { roomId, seed });
    return projectState({
      roomId,
      gameId,
      core,
      turnNumber: 1,
      roundNumber: core.roundNumber,
      prevVersion: 0,
    });
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as GinRummyPublicData;

    // Ack-show: resume the game between rounds.
    if (action.type === 'ack-show') {
      return this.handleAckShow(state, playerId);
    }

    let core = pd.core;

    switch (action.type) {
      case 'draw': {
        const source = (action.payload?.['source'] as 'deck' | 'discard' | undefined) ?? 'deck';
        if (core.phase === 'firstTurnOffer' || core.phase === 'firstTurnOfferDealer') {
          core = coreApply(core, {
            kind: source === 'discard' ? 'takeInitialDiscard' : 'passInitialDiscard',
            playerId,
          });
        } else {
          core = coreApply(core, {
            kind: source === 'discard' ? 'drawDiscard' : 'drawStock',
            playerId,
          });
        }
        break;
      }
      case 'discard': {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 1) throw new Error('Gin Rummy discard requires exactly one card');
        core = coreApply(core, { kind: 'discard', playerId, cardId: cardIds[0]! });
        break;
      }
      case 'knock': {
        core = this.handleKnockLike(core, playerId, action, 'knock');
        break;
      }
      case 'gin': {
        core = this.handleKnockLike(core, playerId, action, 'gin');
        break;
      }
      case 'bigGin': {
        core = this.handleKnockLike(core, playerId, action, 'bigGin');
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
      roundNumber: core.roundNumber,
      prevVersion: state.version,
    });
  }

  /**
   * Translate the UI's combined knock/gin/bigGin action into core
   * actions. The UI doesn't let the player choose their meld partition
   * — we always submit the optimal one computed from their hand.
   * After a non-gin knock, the adapter auto-resolves the layoff phase.
   */
  private handleKnockLike(
    core: CoreState,
    playerId: string,
    action: PlayerAction,
    ending: 'knock' | 'gin' | 'bigGin',
  ): CoreState {
    const currentPlayer = core.players.find((p) => p.id === playerId);
    if (!currentPlayer) throw new Error(`Unknown player ${playerId}`);

    if (ending === 'bigGin') {
      const partition = computeOptimalMeldingPartition(currentPlayer.hand);
      return coreApply(core, { kind: 'bigGin', playerId, meldingPartition: partition });
    }

    // Knock / gin need a discard.
    const incomingCardIds = action.cardIds ?? [];
    let discardCardId = incomingCardIds[0];

    if (!discardCardId) {
      // Pick the highest-value card from the current deadwood partition.
      const fullPart = computeOptimalMeldingPartition(currentPlayer.hand);
      if (fullPart.deadwood.length === 0) {
        discardCardId = currentPlayer.hand[0]!.id;
      } else {
        const sortedDeadwood = [...fullPart.deadwood].sort(
          (a, b) => RANK_NUMERIC[b.rank] - RANK_NUMERIC[a.rank],
        );
        discardCardId = sortedDeadwood[0]!.id;
      }
    }

    const handAfterDiscard = currentPlayer.hand.filter((c) => c.id !== discardCardId);
    const partition = computeOptimalMeldingPartition(handAfterDiscard);

    // If the post-discard hand has zero deadwood the round is gin, not
    // knock — the core's `applyKnock` strictly rejects zero-deadwood
    // hands ("use `gin` instead of `knock`"). Auto-promote the action
    // here so the UI / bot can keep emitting a single 'knock' action
    // for both endings without tripping the validator. (Players were
    // unable to call gin because the FE only emits 'knock'.)
    const postDiscardDeadwood = partition.deadwood.length;
    const effectiveEnding: 'knock' | 'gin' =
      ending === 'gin' || postDiscardDeadwood === 0 ? 'gin' : 'knock';

    let nextCore: CoreState;
    if (effectiveEnding === 'gin') {
      nextCore = coreApply(core, {
        kind: 'gin',
        playerId,
        meldingPartition: partition,
        discardCardId,
      });
    } else {
      nextCore = coreApply(core, {
        kind: 'knock',
        playerId,
        meldingPartition: partition,
        discardCardId,
      });
      nextCore = autoResolveLayoff(nextCore);
    }
    return nextCore;
  }

  private handleAckShow(state: GameState, playerId: string): GameState {
    const pd = state.publicData as unknown as GinRummyPublicData;
    if (!pd.showdown || !pd.showdown.active) {
      throw new Error('No showdown active');
    }
    if (pd.showdown.acked.includes(playerId)) return state;
    const acked = [...pd.showdown.acked, playerId];
    const nonBots = state.players.filter((p) => !p.isBot);
    const allHumansAcked = nonBots.every((p) => acked.includes(p.playerId));

    let core = pd.core;
    if (allHumansAcked && core.phase === 'roundOver' && !core.gameWinnerId) {
      core = coreStartNextRound(core);
    }

    return projectState({
      roomId: state.roomId,
      gameId: state.gameId,
      core,
      turnNumber: state.turnNumber + 1,
      roundNumber: core.roundNumber,
      prevVersion: state.version,
      ackOverride: allHumansAcked ? [] : acked,
    });
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as GinRummyPublicData;
    if (pd.showdown?.active) {
      if (pd.showdown.acked.includes(playerId)) return [];
      return [{ type: 'ack-show' }];
    }

    const core = pd.core;
    if (core.phase === 'roundOver' || core.phase === 'gameOver') return [];

    const currentPlayer = core.players[core.currentPlayerIndex];
    if (playerId !== currentPlayer.id) return [];

    const out: PlayerAction[] = [];
    if (core.phase === 'firstTurnOffer' || core.phase === 'firstTurnOfferDealer') {
      out.push({ type: 'draw', payload: { source: 'discard' } });
      out.push({ type: 'draw', payload: { source: 'deck' } });
      return out;
    }
    if (core.phase === 'awaitingDraw') {
      if (core.stock.length > 0) out.push({ type: 'draw', payload: { source: 'deck' } });
      if (core.discard.length > 0) out.push({ type: 'draw', payload: { source: 'discard' } });
      return out;
    }
    if (core.phase === 'awaitingKnockOrDiscard') {
      for (const c of currentPlayer.hand) {
        if (core.discardDrawnThisTurn === c.id) continue;
        out.push({ type: 'discard', cardIds: [c.id] });
      }
      const partition = computeOptimalMeldingPartition(currentPlayer.hand);
      if (currentPlayer.hand.length === 11 && partition.deadwood.length === 0 && core.config.allowBigGin) {
        out.push({ type: 'bigGin' });
      }
    }
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
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

// ─── Helpers ────────────────────────────────────────────────────────

function autoResolveLayoff(core: CoreState): CoreState {
  let s = core;
  let safety = 0;
  while (s.phase === 'awaitingLayoff' && s.awaitingLayoff && safety < 100) {
    safety++;
    const { knockerId, knockerMelds } = s.awaitingLayoff;
    const defender = s.players.find((p) => p.id !== knockerId)!;
    let laid = false;
    for (const card of defender.hand) {
      for (const meld of knockerMelds) {
        if (canLayoffLocal(card, meld)) {
          s = coreApply(s, {
            kind: 'layoffCard',
            playerId: defender.id,
            cardId: card.id,
            targetMeldId: meld.id,
          });
          laid = true;
          break;
        }
      }
      if (laid) break;
    }
    if (!laid) {
      s = coreApply(s, { kind: 'doneLayingOff', playerId: defender.id });
    }
  }
  return s;
}

function canLayoffLocal(card: CoreCard, meld: CoreMeld): boolean {
  if (meld.kind === 'set') {
    if (card.rank !== meld.cards[0]!.rank) return false;
    if (meld.cards.some((c) => c.suit === card.suit)) return false;
    if (meld.cards.length >= 4) return false;
    return true;
  }
  if (card.suit !== meld.cards[0]!.suit) return false;
  const ranks = meld.cards.map((c) => RANK_NUMERIC[c.rank]).sort((a, b) => a - b);
  const v = RANK_NUMERIC[card.rank];
  if (v === ranks[0]! - 1 && v >= 1) return true;
  if (v === ranks[ranks.length - 1]! + 1 && v <= 13) return true;
  return false;
}

// ─── State projection ───────────────────────────────────────────────

function projectState(args: {
  roomId: string;
  gameId: string;
  core: CoreState;
  turnNumber: number;
  roundNumber: number;
  prevVersion: number;
  ackOverride?: string[];
}): GameState {
  const { roomId, gameId, core } = args;

  const discardTop =
    core.discard.length > 0
      ? toPlatformCard(core.discard[core.discard.length - 1]!, true)
      : null;

  const platformPlayers = core.players.map((p) => ({
    playerId: p.id,
    displayName: p.id,
    hand: p.hand.map((c) => toPlatformCard(c, true)),
    score: p.scoreTotal,
    isOut: false,
    isBot: false,
  }));

  const turnPhase: 'draw' | 'discard' =
    core.phase === 'awaitingKnockOrDiscard' ? 'discard' : 'draw';

  const showdown: ShowdownData | null =
    core.roundResult && core.phase !== 'awaitingDraw'
      ? buildShowdown(core, args.ackOverride)
      : null;

  const publicData: GinRummyPublicData = {
    core,
    discardTop,
    drawPileSize: core.stock.length,
    turnPhase,
    showdown,
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

function buildShowdown(core: CoreState, ackOverride?: string[]): ShowdownData {
  const r = core.roundResult;
  if (!r || !r.knockerId) {
    return {
      active: false,
      acked: ackOverride ?? [],
      knockerId: '',
      isGin: false,
      isBigGin: false,
      isUndercut: false,
      knockerPts: 0,
      oppPts: 0,
      players: [],
    };
  }
  const knockerId = r.knockerId;
  const defenderId = core.players.find((p) => p.id !== knockerId)!.id;
  const knockerPts = r.winnerId === knockerId ? r.pointsAwarded : 0;
  const oppPts = r.winnerId !== knockerId ? r.pointsAwarded : 0;

  const knocker = core.players.find((p) => p.id === knockerId)!;
  const defender = core.players.find((p) => p.id === defenderId)!;
  const knockerMeldsAsCards: PlatformCard[][] = r.knockerMelds.map((m) =>
    m.cards.map((c) => toPlatformCard(c, true)),
  );
  const defenderMelds = r.opponentPartition
    ? r.opponentPartition.melds.map((m) => m.cards.map((c) => toPlatformCard(c, true)))
    : [];
  const defenderDeadwood = r.opponentPartition
    ? r.opponentPartition.deadwood.map((c) => toPlatformCard(c, true))
    : defender.hand.map((c) => toPlatformCard(c, true));
  const defenderDeadwoodPts = r.opponentDeadwood;

  const players: ShowdownPlayer[] = [
    {
      playerId: knockerId,
      displayName: knockerId,
      isBot: false,
      melds: knockerMeldsAsCards,
      deadwood: knocker.hand
        .map((c) => toPlatformCard(c, true))
        .filter(
          (c) => !r.knockerMelds.some((m) => m.cards.some((mc) => mc.id === c.id)),
        ),
      deadwoodPts: r.knockerDeadwood,
      laidOff: [],
    },
    {
      playerId: defenderId,
      displayName: defenderId,
      isBot: false,
      melds: defenderMelds,
      deadwood: defenderDeadwood,
      deadwoodPts: defenderDeadwoodPts,
      laidOff: r.laidOffCards.map((c) => toPlatformCard(c, true)),
    },
  ];

  return {
    active: true,
    acked: ackOverride ?? [],
    knockerId,
    isGin: r.ending === 'gin' || r.ending === 'bigGin',
    isBigGin: r.ending === 'bigGin',
    isUndercut: r.ending === 'undercut',
    knockerPts,
    oppPts,
    players,
  };
}

export { computeOptimalMeldingPartition } from './core';

/**
 * Back-compat helper used by the bot strategy. Given a platform-shape
 * hand, returns the total deadwood after the optimal meld partition.
 * Deadwood point values: A=1, 2–10=face, J/Q/K=10.
 */
export function computeDeadwood(hand: PlatformCard[]): number {
  const core: CoreCard[] = hand.map((c) => {
    if (!c.suit || !c.rank) throw new Error('Non-standard card in computeDeadwood');
    const suit: CoreSuit = c.suit === 'spades' ? 'S' : c.suit === 'hearts' ? 'H' : c.suit === 'diamonds' ? 'D' : 'C';
    return { id: c.id, suit, rank: c.rank as CoreRank };
  });
  const partition = computeOptimalMeldingPartition(core);
  return partition.deadwood.reduce((n, c) => {
    if (c.rank === 'A') return n + 1;
    if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return n + 10;
    return n + parseInt(c.rank, 10);
  }, 0);
}
