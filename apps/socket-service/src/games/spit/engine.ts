/**
 * Spit (Speed) Game Engine
 *
 * Standard 52-card deck, 2 players.
 * Each player gets a 26-card stock pile.
 * Two central play piles; both players play simultaneously.
 * Cards are played on a central pile if they are +1 or −1 from top card.
 * "Spit!" signals new round with top-of-stock to each center pile.
 * Win: first to empty stock + tableau.
 *
 * Simplified: turn-based play-or-draw; action types 'play' and 'spit'.
 * Real-time only.
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

interface SpitPublicData {
  stockPiles: Record<string, Card[]>; // playerId -> cards
  centerPile1: Card[];
  centerPile2: Card[];
  centerTop1: Card | null;
  centerTop2: Card | null;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function rankVal(card: Card): number {
  if (!card.rank) return 0;
  const map: Record<string, number> = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
  };
  return map[card.rank] ?? 0;
}

function canPlayOn(card: Card, top: Card | null): boolean {
  if (!top) return true;
  const diff = Math.abs(rankVal(card) - rankVal(top));
  // Wrap A-K
  return diff === 1 || diff === 12;
}

export class SpitEngine implements IGameEngine {
  readonly gameId = 'spit';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 2;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 2) throw new Error('Spit requires exactly 2 players');

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const stockPiles: Record<string, Card[]> = {
      [playerIds[0]!]: cards.splice(0, 26).map(c => ({ ...c, faceUp: false })),
      [playerIds[1]!]: cards.splice(0, 26).map(c => ({ ...c, faceUp: false })),
    };

    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: stockPiles[playerId]!.splice(0, 5).map(c => ({ ...c, faceUp: true })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    const publicData: SpitPublicData = {
      stockPiles,
      centerPile1: [],
      centerPile2: [],
      centerTop1: null,
      centerTop2: null,
    };

    logger.debug('SpitEngine.startGame', { roomId });

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
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    const pd = state.publicData as unknown as SpitPublicData;

    switch (action.type) {
      case 'play': return this.handlePlay(state, playerId, action, pd);
      case 'spit': return this.handleSpit(state, playerId, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as SpitPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    const actions: PlayerAction[] = [];
    for (const card of player.hand) {
      if (canPlayOn(card, pd.centerTop1)) actions.push({ type: 'play', cardIds: [card.id], payload: { pile: 1 } });
      if (canPlayOn(card, pd.centerTop2)) actions.push({ type: 'play', cardIds: [card.id], payload: { pile: 2 } });
    }
    // Always allow spit if stock has cards
    const stock = pd.stockPiles[playerId] ?? [];
    if (stock.length > 0) actions.push({ type: 'spit' });
    return actions;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const pd = state.publicData as unknown as SpitPublicData;
    const sorted = [...state.players]
      .map(p => ({
        ...p,
        total: p.hand.length + (pd.stockPiles[p.playerId]?.length ?? 0),
      }))
      .sort((a, b) => a.total - b.total);

    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: p.total,
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }

  private handlePlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: SpitPublicData,
  ): GameState {
    const cardId = action.cardIds?.[0];
    const pile = (action.payload?.pile as number) ?? 1;
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    const topCard = pile === 1 ? pd.centerTop1 : pd.centerTop2;
    if (!canPlayOn(card, topCard)) throw new Error('Cannot play card on that pile');

    const playedCard = { ...card, faceUp: true };
    const newHand = player.hand.filter(c => c.id !== cardId);

    // Refill from stock if possible
    const stock = [...(pd.stockPiles[playerId] ?? [])];
    let finalHand = newHand;
    if (newHand.length < 5 && stock.length > 0) {
      finalHand = [...newHand, { ...stock.pop()!, faceUp: true }];
    }

    const newCenterPile1 = pile === 1 ? [...pd.centerPile1, playedCard] : pd.centerPile1;
    const newCenterPile2 = pile === 2 ? [...pd.centerPile2, playedCard] : pd.centerPile2;

    const newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: finalHand } : p
    );

    const newPd: SpitPublicData = {
      ...pd,
      stockPiles: { ...pd.stockPiles, [playerId]: stock },
      centerPile1: newCenterPile1,
      centerPile2: newCenterPile2,
      centerTop1: pile === 1 ? playedCard : pd.centerTop1,
      centerTop2: pile === 2 ? playedCard : pd.centerTop2,
    };

    const gameOver = finalHand.length === 0 && stock.length === 0;

    const nextTurn = state.players[(state.players.findIndex(p => p.playerId === playerId) + 1) % 2]!.playerId;

    return {
      ...state,
      version: state.version + 1,
      phase: gameOver ? 'ended' : 'playing',
      players: newPlayers,
      currentTurn: gameOver ? null : nextTurn,
      turnNumber: state.turnNumber + 1,
      publicData: newPd as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleSpit(state: GameState, playerId: string, pd: SpitPublicData): GameState {
    const stock = [...(pd.stockPiles[playerId] ?? [])];
    if (stock.length === 0) throw new Error('No cards in stock to spit');

    const spitCard = { ...stock.pop()!, faceUp: true };

    // Add to smaller center pile
    const pile1Size = pd.centerPile1.length;
    const pile2Size = pd.centerPile2.length;

    const newPd: SpitPublicData = pile1Size <= pile2Size
      ? {
        ...pd,
        stockPiles: { ...pd.stockPiles, [playerId]: stock },
        centerPile1: [...pd.centerPile1, spitCard],
        centerTop1: spitCard,
      }
      : {
        ...pd,
        stockPiles: { ...pd.stockPiles, [playerId]: stock },
        centerPile2: [...pd.centerPile2, spitCard],
        centerTop2: spitCard,
      };

    return {
      ...state,
      version: state.version + 1,
      publicData: newPd as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
