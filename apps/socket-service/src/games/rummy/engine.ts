/**
 * Rummy Game Engine
 *
 * Standard 52-card deck, 2–6 players.
 * Deal: 10 cards (2p), 7 cards (3–4p), 6 cards (5–6p).
 * Turn: draw from deck or discard, optionally meld, discard.
 * Meld: 3+ same rank (set) or 3+ sequential same suit (run).
 * Win: empty hand after discarding.
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerRanking,
  Card,
} from '@card-platform/shared-types';
import { createStandardDeck } from '@card-platform/cards-engine';
import { logger } from '../../utils/logger';

interface RummyPublicData {
  drawPile: Card[];
  drawPileSize: number;
  discardPile: Card[];
  discardTop: Card | null;
  turnPhase: 'draw' | 'discard';
  melds: Array<{ playerId: string; cards: Card[] }>;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function dealCount(playerCount: number): number {
  if (playerCount === 2) return 10;
  if (playerCount <= 4) return 7;
  return 6;
}

function rankValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank, 10);
}

/** Check if a group of cards forms a valid meld (set or run). */
export function isValidMeld(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  // Try as set
  if (isSet(cards)) return true;
  // Try as run
  if (isRun(cards)) return true;
  return false;
}

function isSet(cards: Card[]): boolean {
  const rank = cards[0]!.rank;
  return cards.every(c => c.rank === rank);
}

function isRun(cards: Card[]): boolean {
  const suit = cards[0]!.suit;
  if (!cards.every(c => c.suit === suit)) return false;
  const sorted = [...cards].sort((a, b) => rankValue(a.rank!) - rankValue(b.rank!));
  for (let i = 1; i < sorted.length; i++) {
    if (rankValue(sorted[i]!.rank!) !== rankValue(sorted[i - 1]!.rank!) + 1) return false;
  }
  return true;
}

function cardPoints(card: Card): number {
  if (!card.rank) return 0;
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return Math.min(parseInt(card.rank, 10), 10);
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
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

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const count = dealCount(playerIds.length);
    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, count).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    const discardCard = cards.splice(0, 1)[0]!;
    const discardTop = { ...discardCard, faceUp: true };

    const publicData: RummyPublicData = {
      drawPile: cards,
      drawPileSize: cards.length,
      discardPile: [discardTop],
      discardTop,
      turnPhase: 'draw',
      melds: [],
    };

    logger.debug('RummyEngine.startGame', { roomId, playerCount: playerIds.length });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[0]!,
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) {
      throw new Error(`Not ${playerId}'s turn`);
    }
    const pd = state.publicData as unknown as RummyPublicData;

    switch (action.type) {
      case 'draw': return this.handleDraw(state, playerId, action, pd);
      case 'meld': return this.handleMeld(state, playerId, action, pd);
      case 'discard': return this.handleDiscard(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as RummyPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    if (pd.turnPhase === 'draw') {
      const actions: PlayerAction[] = [{ type: 'draw', payload: { source: 'deck' } }];
      if (pd.discardTop) {
        actions.push({ type: 'draw', payload: { source: 'discard' } });
      }
      return actions;
    }

    // discard phase
    const actions: PlayerAction[] = player.hand.map(c => ({ type: 'discard', cardIds: [c.id] }));
    return actions;
  }

  computeResult(state: GameState): PlayerRanking[] {
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

  private handleDraw(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: RummyPublicData,
  ): GameState {
    if (pd.turnPhase !== 'draw') throw new Error('Must discard first');
    const source = (action.payload?.source as string) ?? 'deck';
    let newDraw = [...pd.drawPile];
    let newDiscard = [...pd.discardPile];
    let drawn: Card;

    if (source === 'discard') {
      if (newDiscard.length === 0) throw new Error('Discard pile empty');
      drawn = newDiscard.pop()!;
    } else {
      if (newDraw.length === 0) {
        if (newDiscard.length <= 1) throw new Error('No cards to draw');
        const top = newDiscard.pop()!;
        newDraw = newDiscard;
        shuffle(newDraw);
        newDiscard = [top];
      }
      drawn = newDraw.pop()!;
    }

    const newDiscardTop = newDiscard.length > 0 ? newDiscard[newDiscard.length - 1]! : null;

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === playerId ? { ...p, hand: [...p.hand, { ...drawn, faceUp: false }] } : p
      ),
      publicData: {
        ...pd,
        drawPile: newDraw,
        drawPileSize: newDraw.length,
        discardPile: newDiscard,
        discardTop: newDiscardTop,
        turnPhase: 'discard',
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleMeld(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: RummyPublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') throw new Error('Must draw first');
    const cardIds = action.cardIds ?? [];
    const player = state.players.find(p => p.playerId === playerId)!;
    const meldCards = player.hand.filter(c => cardIds.includes(c.id));
    if (meldCards.length !== cardIds.length) throw new Error('Cards not in hand');
    if (!isValidMeld(meldCards)) throw new Error('Invalid meld');

    const newHand = player.hand.filter(c => !cardIds.includes(c.id));
    const newMelds = [...pd.melds, { playerId, cards: meldCards }];

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === playerId ? { ...p, hand: newHand } : p
      ),
      publicData: {
        ...pd,
        melds: newMelds,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleDiscard(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: RummyPublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') throw new Error('Must draw first');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    const newHand = player.hand.filter(c => c.id !== cardId);
    const faceUp = { ...card, faceUp: true };
    const newDiscardPile = [...pd.discardPile, faceUp];

    const wentOut = newHand.length === 0;

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand, isOut: wentOut || p.isOut } : p
    );

    let newPhase = state.phase;
    if (wentOut) {
      // Score remaining players' hands
      newPlayers = newPlayers.map(p => {
        if (p.playerId === playerId) return p;
        const pts = p.hand.reduce((sum, c) => sum + cardPoints(c), 0);
        return { ...p, score: p.score + pts };
      });
      newPhase = 'ended';
    }

    const next = wentOut ? null : nextPlayer(state.players, playerId);

    return {
      ...state,
      version: state.version + 1,
      phase: newPhase,
      players: newPlayers,
      currentTurn: next,
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        discardPile: newDiscardPile,
        discardTop: faceUp,
        turnPhase: 'draw',
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
