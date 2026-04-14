/**
 * Idiot (Palace / Shithead) Game Engine
 *
 * Standard 52-card deck, 2–6 players.
 * Each player: 3 face-down table cards, 3 face-up table cards, 3 hand cards.
 * Turn order: play equal-or-higher card to discard pile, or pick up pile.
 * Special: 2=reset (any), 10=burn pile, 7=must play lower or equal, Ace=high.
 * Win: first to empty all cards (hand, then face-up table, then face-down).
 *
 * Simplified: hand phase only for engine correctness.
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

interface IdiotPublicData {
  drawPile: Card[];
  drawPileSize: number;
  discardPile: Card[];
  discardTop: Card | null;
  tableDown: Record<string, Card[]>; // face-down table cards
  tableUp: Record<string, Card[]>;   // face-up table cards
  mustPlayLower: boolean;
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
    '2': 15, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, // 2 = reset (above all)
    '8': 8, '9': 9, '10': 20, J: 11, Q: 12, K: 13, A: 14, // 10 = burn
  };
  return map[card.rank] ?? 0;
}

function canPlayOnDiscard(card: Card, top: Card | null, mustPlayLower: boolean): boolean {
  if (!top || card.rank === '2' || card.rank === '10') return true;
  const cardVal = rankVal(card);
  const topVal = top.rank === '7' ? 7 : rankVal(top);
  if (mustPlayLower || top.rank === '7') return cardVal <= topVal;
  return cardVal >= topVal;
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class IdiotEngine implements IGameEngine {
  readonly gameId = 'idiot';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 6) {
      throw new Error('Idiot requires 2–6 players');
    }

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const tableDown: Record<string, Card[]> = {};
    const tableUp: Record<string, Card[]> = {};

    const players = playerIds.map(playerId => {
      const down = cards.splice(0, 3).map(c => ({ ...c, faceUp: false }));
      const up = cards.splice(0, 3).map(c => ({ ...c, faceUp: true }));
      const hand = cards.splice(0, 3).map(c => ({ ...c, faceUp: false }));
      tableDown[playerId] = down;
      tableUp[playerId] = up;
      return {
        playerId,
        displayName: playerId,
        hand,
        score: 0,
        isOut: false,
        isBot: false,
      };
    });

    const publicData: IdiotPublicData = {
      drawPile: cards,
      drawPileSize: cards.length,
      discardPile: [],
      discardTop: null,
      tableDown,
      tableUp,
      mustPlayLower: false,
    };

    logger.debug('IdiotEngine.startGame', { roomId, playerCount: playerIds.length });

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
    const pd = state.publicData as unknown as IdiotPublicData;

    switch (action.type) {
      case 'play': return this.handlePlay(state, playerId, action, pd);
      case 'pickup': return this.handlePickup(state, playerId, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as IdiotPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    const playable = player.hand.filter(c =>
      canPlayOnDiscard(c, pd.discardTop, pd.mustPlayLower)
    );

    if (playable.length > 0) {
      return [
        ...playable.map(c => ({ type: 'play', cardIds: [c.id] })),
        { type: 'pickup' },
      ];
    }
    return [{ type: 'pickup' }];
  }

  computeResult(state: GameState): PlayerRanking[] {
    // Winner = first to finish; rank by isOut time or hand size
    const sorted = [...state.players].sort((a, b) => {
      if (a.isOut && !b.isOut) return -1;
      if (!a.isOut && b.isOut) return 1;
      return a.hand.length - b.hand.length;
    });
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
    pd: IdiotPublicData,
  ): GameState {
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    if (!canPlayOnDiscard(card, pd.discardTop, pd.mustPlayLower)) {
      throw new Error('Cannot play that card');
    }

    const faceUp = { ...card, faceUp: true };
    let newDiscard = [...pd.discardPile, faceUp];
    let newHand = player.hand.filter(c => c.id !== cardId);
    let drawPile = [...pd.drawPile];

    // Refill hand from draw pile to 3+ if possible
    while (newHand.length < 3 && drawPile.length > 0) {
      newHand.push({ ...drawPile.pop()!, faceUp: false });
    }

    // Special cards
    let isBurn = card.rank === '10';
    let isReset = card.rank === '2';
    let mustPlayLower = card.rank === '7';

    if (isBurn) {
      newDiscard = []; // burn the pile
    }

    const wentOut = newHand.length === 0
      && (pd.tableUp[playerId]?.length ?? 0) === 0
      && (pd.tableDown[playerId]?.length ?? 0) === 0;

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand, isOut: wentOut } : p
    );

    const allOut = newPlayers.filter(p => !p.isOut).length <= 1;

    return {
      ...state,
      version: state.version + 1,
      phase: allOut ? 'ended' : 'playing',
      players: newPlayers,
      currentTurn: allOut ? null : (isBurn ? playerId : nextPlayer(state.players, playerId)),
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        drawPile,
        drawPileSize: drawPile.length,
        discardPile: newDiscard,
        discardTop: isBurn ? null : faceUp,
        mustPlayLower: isReset ? false : mustPlayLower,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handlePickup(state: GameState, playerId: string, pd: IdiotPublicData): GameState {
    const player = state.players.find(p => p.playerId === playerId)!;
    const pickedUp = [...pd.discardPile];
    const newHand = [...player.hand, ...pickedUp.map(c => ({ ...c, faceUp: false }))];

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === playerId ? { ...p, hand: newHand } : p
      ),
      currentTurn: nextPlayer(state.players, playerId),
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        discardPile: [],
        discardTop: null,
        mustPlayLower: false,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
