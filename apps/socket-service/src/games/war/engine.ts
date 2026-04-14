/**
 * War Game Engine
 *
 * Standard 52-card deck, 2 players.
 * Split deck evenly (26 cards each, face-down).
 * Each turn: both players flip their top card; higher card wins both.
 * Tie = "war": each player plays 3 face-down, then 1 face-up.
 * Win: all 52 cards (or most cards when deck runs out).
 * Real-time only (supportsAsync: false).
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

interface WarPublicData {
  warPile: Card[]; // cards at stake in a war
  lastBattle: Array<{ playerId: string; card: Card }> | null;
  atWar: boolean;
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
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
  };
  return map[card.rank] ?? 0;
}

export class WarEngine implements IGameEngine {
  readonly gameId = 'war';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 2;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 2) throw new Error('War requires exactly 2 players');

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const players = playerIds.map((playerId, i) => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, 26).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    const publicData: WarPublicData = {
      warPile: [],
      lastBattle: null,
      atWar: false,
    };

    logger.debug('WarEngine.startGame', { roomId });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[0]!, // In War both players flip at same time — we simulate via p0 triggering
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    if (action.type !== 'flip') throw new Error(`Unknown action: ${action.type}`);

    const pd = state.publicData as unknown as WarPublicData;
    return this.handleFlip(state, playerId, pd);
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const player = state.players.find(p => p.playerId === playerId);
    if (!player || player.hand.length === 0) return [];
    return [{ type: 'flip' }];
  }

  computeResult(state: GameState): PlayerRanking[] {
    const sorted = [...state.players].sort((a, b) => b.hand.length - a.hand.length);
    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: p.hand.length,
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }

  private handleFlip(state: GameState, playerId: string, pd: WarPublicData): GameState {
    const p0 = state.players[0]!;
    const p1 = state.players[1]!;

    if (p0.hand.length === 0 || p1.hand.length === 0) {
      return {
        ...state,
        version: state.version + 1,
        phase: 'ended',
        currentTurn: null,
        updatedAt: new Date().toISOString(),
      };
    }

    // Both players flip their top card
    const card0 = { ...p0.hand[0]!, faceUp: true };
    const card1 = { ...p1.hand[0]!, faceUp: true };
    const newHand0 = p0.hand.slice(1);
    const newHand1 = p1.hand.slice(1);

    const warPile = [...pd.warPile, card0, card1];
    const lastBattle = [
      { playerId: p0.playerId, card: card0 },
      { playerId: p1.playerId, card: card1 },
    ];

    const val0 = rankVal(card0);
    const val1 = rankVal(card1);

    if (val0 === val1) {
      // War! Put 3 face-down cards from each into war pile (if available)
      const warCards0 = newHand0.splice(0, Math.min(3, newHand0.length));
      const warCards1 = newHand1.splice(0, Math.min(3, newHand1.length));
      const newWarPile = [...warPile, ...warCards0, ...warCards1];

      return {
        ...state,
        version: state.version + 1,
        players: [
          { ...p0, hand: newHand0 },
          { ...p1, hand: newHand1 },
        ],
        publicData: {
          warPile: newWarPile,
          lastBattle,
          atWar: true,
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    // Winner takes all
    const winner = val0 > val1 ? p0 : p1;
    const loser = val0 > val1 ? p1 : p0;
    const winnerHand0 = val0 > val1 ? newHand0 : newHand1;
    const loserHand = val0 > val1 ? newHand1 : newHand0;

    const prize = [...warPile];
    shuffle(prize);

    const winnerFinalHand = [...winnerHand0, ...prize.map(c => ({ ...c, faceUp: false }))];
    const loserFinalHand = [...loserHand];

    const updatedPlayers = state.players.map(p => {
      if (p.playerId === winner.playerId) return { ...p, hand: winnerFinalHand };
      return { ...p, hand: loserFinalHand };
    });

    const gameOver = loserFinalHand.length === 0;

    return {
      ...state,
      version: state.version + 1,
      phase: gameOver ? 'ended' : 'playing',
      players: updatedPlayers,
      currentTurn: gameOver ? null : p0.playerId,
      turnNumber: state.turnNumber + 1,
      publicData: {
        warPile: [],
        lastBattle,
        atWar: false,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
