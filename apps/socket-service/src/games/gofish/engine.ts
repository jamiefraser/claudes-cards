/**
 * Go Fish Game Engine
 *
 * Standard 52-card deck, 2–6 players.
 * Deal 7 cards (2p) or 5 cards (3–6p).
 * On your turn: ask any opponent for a rank you hold.
 *   - They give all matching cards → go again.
 *   - No match → "Go Fish" from deck; if drawn card = asked rank → go again.
 * Complete books (4 of a kind) set aside.
 * Win: most books when deck/hands exhausted.
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

interface GoFishPublicData {
  drawPile: Card[];
  drawPileSize: number;
  books: Record<string, string[]>; // playerId -> rank[]
  lastAction: string | null;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function checkAndRemoveBooks(hand: Card[]): { newHand: Card[]; books: string[] } {
  const books: string[] = [];
  const byRank: Record<string, Card[]> = {};
  for (const c of hand) {
    const r = c.rank ?? '';
    byRank[r] = byRank[r] ?? [];
    byRank[r]!.push(c);
  }
  const newHand: Card[] = [];
  for (const [rank, cards] of Object.entries(byRank)) {
    if (cards.length === 4) {
      books.push(rank);
    } else {
      newHand.push(...cards);
    }
  }
  return { newHand, books };
}

function isGameOver(drawPile: Card[], players: GameState['players']): boolean {
  return drawPile.length === 0 && players.every(p => p.hand.length === 0);
}

export class GoFishEngine implements IGameEngine {
  readonly gameId = 'gofish';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 6) throw new Error('Go Fish requires 2–6 players');

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const dealCount = playerIds.length === 2 ? 7 : 5;
    const books: Record<string, string[]> = {};

    const players = playerIds.map(playerId => {
      const hand = cards.splice(0, dealCount);
      const { newHand, books: initialBooks } = checkAndRemoveBooks(hand);
      books[playerId] = initialBooks;
      return {
        playerId,
        displayName: playerId,
        hand: newHand.map(c => ({ ...c, faceUp: false })),
        score: initialBooks.length,
        isOut: false,
        isBot: false,
      };
    });

    const publicData: GoFishPublicData = {
      drawPile: cards,
      drawPileSize: cards.length,
      books,
      lastAction: null,
    };

    logger.debug('GoFishEngine.startGame', { roomId, playerCount: playerIds.length });

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
    const pd = state.publicData as unknown as GoFishPublicData;

    if (action.type !== 'ask') throw new Error(`Unknown action: ${action.type}`);
    return this.handleAsk(state, playerId, action, pd);
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const player = state.players.find(p => p.playerId === playerId);
    if (!player || player.hand.length === 0) return [];

    // Get unique ranks in hand
    const ranks = [...new Set(player.hand.map(c => c.rank).filter(Boolean))];
    const opponents = state.players.filter(p => p.playerId !== playerId);

    const actions: PlayerAction[] = [];
    for (const rank of ranks) {
      for (const opp of opponents) {
        actions.push({ type: 'ask', payload: { targetPlayerId: opp.playerId, rank } });
      }
    }
    return actions;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const pd = state.publicData as unknown as GoFishPublicData;
    const sorted = [...state.players]
      .map(p => ({ ...p, bookCount: (pd.books[p.playerId] ?? []).length }))
      .sort((a, b) => b.bookCount - a.bookCount);

    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: p.bookCount,
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }

  private handleAsk(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: GoFishPublicData,
  ): GameState {
    const targetPlayerId = action.payload?.targetPlayerId as string;
    const rank = action.payload?.rank as string;

    if (!targetPlayerId || !rank) throw new Error('ask requires targetPlayerId and rank');

    const player = state.players.find(p => p.playerId === playerId)!;
    const target = state.players.find(p => p.playerId === targetPlayerId);
    if (!target) throw new Error(`Player ${targetPlayerId} not found`);

    if (!player.hand.some(c => c.rank === rank)) {
      throw new Error(`Player does not hold rank ${rank}`);
    }

    const matchingCards = target.hand.filter(c => c.rank === rank);
    let newDraw = [...pd.drawPile];
    let goAgain = false;

    let updatedPlayers: GameState['players'];
    let newBooks = { ...pd.books };

    if (matchingCards.length > 0) {
      // Transfer cards to player
      goAgain = true;
      const receivedHand = [...player.hand, ...matchingCards.map(c => ({ ...c, faceUp: false }))];
      const { newHand: playerHand, books: newlyMade } = checkAndRemoveBooks(receivedHand);

      if (newlyMade.length > 0) {
        newBooks[playerId] = [...(newBooks[playerId] ?? []), ...newlyMade];
      }

      updatedPlayers = state.players.map(p => {
        if (p.playerId === playerId) {
          return {
            ...p,
            hand: playerHand,
            score: (newBooks[playerId] ?? []).length,
          };
        }
        if (p.playerId === targetPlayerId) {
          return { ...p, hand: p.hand.filter(c => c.rank !== rank) };
        }
        return p;
      });
    } else {
      // Go fish — draw from deck
      let drawnCard: Card | null = null;
      if (newDraw.length > 0) {
        drawnCard = newDraw.pop()!;
      }

      goAgain = drawnCard?.rank === rank;

      let receivedHand = [...player.hand, ...(drawnCard ? [{ ...drawnCard, faceUp: false }] : [])];
      const { newHand: playerHand, books: newlyMade } = checkAndRemoveBooks(receivedHand);

      if (newlyMade.length > 0) {
        newBooks[playerId] = [...(newBooks[playerId] ?? []), ...newlyMade];
      }

      updatedPlayers = state.players.map(p =>
        p.playerId === playerId
          ? { ...p, hand: playerHand, score: (newBooks[playerId] ?? []).length }
          : p
      );
    }

    const gameOver = isGameOver(newDraw, updatedPlayers);
    const nextTurn = goAgain
      ? playerId
      : updatedPlayers[(updatedPlayers.findIndex(p => p.playerId === playerId) + 1) % updatedPlayers.length]!.playerId;

    return {
      ...state,
      version: state.version + 1,
      phase: gameOver ? 'ended' : 'playing',
      players: updatedPlayers,
      currentTurn: gameOver ? null : nextTurn,
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        drawPile: newDraw,
        drawPileSize: newDraw.length,
        books: newBooks,
        lastAction: matchingCards.length > 0 ? `${playerId} got ${rank}s` : `${playerId} Go Fish`,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
