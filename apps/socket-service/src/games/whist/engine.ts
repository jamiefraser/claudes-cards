/**
 * Whist Game Engine
 *
 * 4 players, standard 52-card deck.
 * Partnerships: (p0+p2) vs (p1+p3).
 * Deal 13 cards each; last card dealt to dealer = trump suit.
 * Follow suit if possible; highest trump or highest of led suit wins.
 * Score: tricks above 6 = 1 pt each. First to 5 points wins (simplified).
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerRanking,
  Card,
  Suit,
} from '@card-platform/shared-types';
import { createStandardDeck } from '@card-platform/cards-engine';
import { logger } from '../../utils/logger';

interface WhistPublicData {
  trumpSuit: Suit;
  currentTrick: Array<{ playerId: string; card: Card }>;
  ledSuit: Suit | null;
  tricksTaken: Record<string, number>;
  teamScores: Record<string, number>;
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

function trickWinner(
  trick: Array<{ playerId: string; card: Card }>,
  trump: Suit,
  ledSuit: Suit,
): string {
  const trumpCards = trick.filter(t => t.card.suit === trump);
  if (trumpCards.length > 0) {
    return trumpCards.reduce((b, t) => rankVal(t.card) > rankVal(b.card) ? t : b).playerId;
  }
  return trick
    .filter(t => t.card.suit === ledSuit)
    .reduce((b, t) => rankVal(t.card) > rankVal(b.card) ? t : b).playerId;
}

function teamOf(playerIds: string[], playerId: string): string {
  const idx = playerIds.indexOf(playerId);
  return idx % 2 === 0 ? 'teamA' : 'teamB';
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class WhistEngine implements IGameEngine {
  readonly gameId = 'whist';
  readonly supportsAsync = false;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 4) throw new Error('Whist requires exactly 4 players');

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, 13).map((c, i, arr) => ({
        ...c,
        faceUp: i === arr.length - 1 && playerId === playerIds[3], // dealer's last card = trump indicator
      })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    // Trump = suit of dealer's last card
    const dealerHand = players[3]!.hand;
    const trumpCard = dealerHand[dealerHand.length - 1]!;
    const trumpSuit = (trumpCard.suit ?? 'spades') as Suit;

    const tricksTaken: Record<string, number> = {};
    for (const id of playerIds) tricksTaken[id] = 0;

    const publicData: WhistPublicData = {
      trumpSuit,
      currentTrick: [],
      ledSuit: null,
      tricksTaken,
      teamScores: { teamA: 0, teamB: 0 },
    };

    logger.debug('WhistEngine.startGame', { roomId, trumpSuit });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[1]!, // Left of dealer leads
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    if (action.type !== 'play') throw new Error(`Unknown action: ${action.type}`);

    const pd = state.publicData as unknown as WhistPublicData;
    return this.handlePlay(state, playerId, action, pd);
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as WhistPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    if (pd.ledSuit) {
      const led = player.hand.filter(c => c.suit === pd.ledSuit);
      if (led.length > 0) return led.map(c => ({ type: 'play', cardIds: [c.id] }));
    }
    return player.hand.map(c => ({ type: 'play', cardIds: [c.id] }));
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

  private handlePlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: WhistPublicData,
  ): GameState {
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    // Hoyle's: must follow the led suit if possible (no trumping when able).
    if (pd.currentTrick.length > 0 && pd.ledSuit && card.suit !== pd.ledSuit) {
      const canFollow = player.hand.some(
        (c) => c.id !== card.id && c.suit === pd.ledSuit,
      );
      if (canFollow) throw new Error(`Must follow ${pd.ledSuit}`);
    }

    const newHand = player.hand.filter(c => c.id !== cardId);
    const ledSuit = (pd.currentTrick.length === 0 ? card.suit! : pd.ledSuit!) as Suit;
    const newTrick = [...pd.currentTrick, { playerId, card: { ...card, faceUp: true } }];

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand } : p
    );

    if (newTrick.length === 4) {
      const winnerId = trickWinner(newTrick, pd.trumpSuit, ledSuit);
      const newTricksTaken = { ...pd.tricksTaken, [winnerId]: (pd.tricksTaken[winnerId] ?? 0) + 1 };

      const handOver = newPlayers.every(p => p.hand.length === 0);
      if (handOver) {
        const playerIds = state.players.map(p => p.playerId);
        const newTeamScores = { ...pd.teamScores };

        for (const team of ['teamA', 'teamB']) {
          const members = playerIds.filter((_, i) => teamOf(playerIds, playerIds[i]!) === team);
          const tricks = members.reduce((s, id) => s + (newTricksTaken[id] ?? 0), 0);
          const pts = Math.max(0, tricks - 6);
          newTeamScores[team] = (newTeamScores[team] ?? 0) + pts;
        }

        newPlayers = newPlayers.map(p => ({
          ...p,
          score: newTeamScores[teamOf(playerIds, p.playerId)] ?? 0,
        }));

        const winner = Object.entries(newTeamScores).find(([, s]) => s >= 5);

        return {
          ...state,
          version: state.version + 1,
          phase: winner ? 'ended' : 'playing',
          players: newPlayers,
          currentTurn: winner ? null : winnerId,
          publicData: {
            ...pd,
            tricksTaken: newTricksTaken,
            currentTrick: [],
            ledSuit: null,
            teamScores: newTeamScores,
          } as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        ...state,
        version: state.version + 1,
        players: newPlayers,
        currentTurn: winnerId,
        publicData: {
          ...pd,
          tricksTaken: newTricksTaken,
          currentTrick: [],
          ledSuit: null,
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      currentTurn: nextPlayer(state.players, playerId),
      publicData: {
        ...pd,
        currentTrick: newTrick,
        ledSuit,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
