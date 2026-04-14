/**
 * Crazy Eights Game Engine
 *
 * Standard 52-card deck, 2–7 players.
 * Deal 7 cards (2p) or 5 cards (3+p).
 * Turn: play a card matching top discard by rank or suit; 8s are wild (declare suit).
 * If can't play: draw until can play or deck exhausted.
 * Win: first to empty hand.
 * Scoring: face value of remaining cards (8 = 50, face = 10, A = 1).
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

interface CrazyEightsPublicData {
  drawPile: Card[];
  drawPileSize: number;
  discardPile: Card[];
  discardTop: Card | null;
  declaredSuit: string | null; // when 8 was played
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function cardPoints(card: Card): number {
  if (card.rank === '8') return 50;
  if (!card.rank) return 0;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 1;
  return parseInt(card.rank, 10);
}

function canPlay(card: Card, discardTop: Card | null, declaredSuit: string | null): boolean {
  if (card.rank === '8') return true;
  if (!discardTop) return true;
  const activeSuit = declaredSuit ?? discardTop.suit;
  return card.suit === activeSuit || card.rank === discardTop.rank;
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class CrazyEightsEngine implements IGameEngine {
  readonly gameId = 'crazyeights';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 7;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 7) {
      throw new Error('Crazy Eights requires 2–7 players');
    }

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const dealCount = playerIds.length === 2 ? 7 : 5;
    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, dealCount).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    // Flip one card (non-8) to start discard pile
    let discardCard: Card | undefined;
    let idx = 0;
    while (idx < cards.length) {
      if (cards[idx]?.rank !== '8') {
        discardCard = cards.splice(idx, 1)[0]!;
        break;
      }
      idx++;
    }
    if (!discardCard) {
      discardCard = cards.splice(0, 1)[0]!;
    }
    const discardTop = { ...discardCard, faceUp: true };

    const publicData: CrazyEightsPublicData = {
      drawPile: cards,
      drawPileSize: cards.length,
      discardPile: [discardTop],
      discardTop,
      declaredSuit: null,
    };

    logger.debug('CrazyEightsEngine.startGame', { roomId, playerCount: playerIds.length });

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
    const pd = state.publicData as unknown as CrazyEightsPublicData;

    switch (action.type) {
      case 'play': return this.handlePlay(state, playerId, action, pd);
      case 'draw': return this.handleDraw(state, playerId, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as CrazyEightsPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    const playable = player.hand.filter(c => canPlay(c, pd.discardTop, pd.declaredSuit));
    if (playable.length > 0) {
      return playable.map(c => ({ type: 'play', cardIds: [c.id] }));
    }
    if (pd.drawPile.length > 0) {
      return [{ type: 'draw' }];
    }
    return [{ type: 'pass' }];
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

  private handlePlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: CrazyEightsPublicData,
  ): GameState {
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    if (!canPlay(card, pd.discardTop, pd.declaredSuit)) {
      throw new Error('Card cannot be played');
    }

    const newHand = player.hand.filter(c => c.id !== cardId);
    const faceUp = { ...card, faceUp: true };
    const newDiscardPile = [...pd.discardPile, faceUp];

    // If 8 played, declare suit
    const declaredSuit = card.rank === '8'
      ? ((action.payload?.suit as string) ?? card.suit ?? 'hearts')
      : null;

    const wentOut = newHand.length === 0;

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand, isOut: wentOut } : p
    );

    if (wentOut) {
      // Score remaining players
      newPlayers = newPlayers.map(p => {
        if (p.playerId === playerId) return p;
        const pts = p.hand.reduce((sum, c) => sum + cardPoints(c), 0);
        return { ...p, score: p.score + pts };
      });
    }

    return {
      ...state,
      version: state.version + 1,
      phase: wentOut ? 'ended' : 'playing',
      players: newPlayers,
      currentTurn: wentOut ? null : nextPlayer(state.players, playerId),
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        discardPile: newDiscardPile,
        discardTop: faceUp,
        declaredSuit,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleDraw(state: GameState, playerId: string, pd: CrazyEightsPublicData): GameState {
    let newDraw = [...pd.drawPile];
    let newDiscard = [...pd.discardPile];

    if (newDraw.length === 0) {
      // Reshuffle discard pile
      if (newDiscard.length <= 1) {
        // No cards to draw — pass turn
        return {
          ...state,
          version: state.version + 1,
          currentTurn: nextPlayer(state.players, playerId),
          updatedAt: new Date().toISOString(),
        };
      }
      const top = newDiscard.pop()!;
      newDraw = newDiscard;
      shuffle(newDraw);
      newDiscard = [top];
    }

    const drawn = newDraw.pop()!;
    const newHand = [...state.players.find(p => p.playerId === playerId)!.hand, { ...drawn, faceUp: false }];
    const discardTop = newDiscard[newDiscard.length - 1]!;

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === playerId ? { ...p, hand: newHand } : p
      ),
      publicData: {
        ...pd,
        drawPile: newDraw,
        drawPileSize: newDraw.length,
        discardPile: newDiscard,
        discardTop,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
