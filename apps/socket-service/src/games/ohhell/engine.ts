/**
 * Oh Hell (Sergeant Major / Whist variant) Game Engine
 *
 * 3–6 players, standard 52-card deck.
 * Rounds: deal 1 card, then 2, ..., up to floor(52/n), then back down.
 * Bid exactly how many tricks you'll win per round.
 * Trump = last card dealt face-up.
 * Score: if bid met exactly → 10 + bid pts; otherwise → −(difference).
 * Win: highest cumulative score after all rounds.
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

type OhHellPhase = 'bidding' | 'playing';

interface OhHellPublicData {
  gamePhase: OhHellPhase;
  bids: Record<string, number>;
  tricksTaken: Record<string, number>;
  currentTrick: Array<{ playerId: string; card: Card }>;
  ledSuit: Suit | null;
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  currentRound: number;
  maxRound: number;
  dealerIndex: number;
  passCount: number;
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
  trump: Suit | null,
  ledSuit: Suit,
): string {
  if (trump) {
    const trumpCards = trick.filter(t => t.card.suit === trump);
    if (trumpCards.length > 0) {
      return trumpCards.reduce((b, t) => rankVal(t.card) > rankVal(b.card) ? t : b).playerId;
    }
  }
  return trick
    .filter(t => t.card.suit === ledSuit)
    .reduce((b, t) => rankVal(t.card) > rankVal(b.card) ? t : b).playerId;
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class OhHellEngine implements IGameEngine {
  readonly gameId = 'ohhell';
  readonly supportsAsync = false;
  readonly minPlayers = 3;
  readonly maxPlayers = 6;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 3 || playerIds.length > 6) {
      throw new Error('Oh Hell requires 3–6 players');
    }

    const maxRound = Math.floor(52 / playerIds.length);
    return this.dealRound(config, playerIds, 1, maxRound, 0, {}, playerIds[0]!);
  }

  private dealRound(
    config: GameConfig,
    playerIds: string[],
    round: number,
    maxRound: number,
    dealerIndex: number,
    existingScores: Record<string, number>,
    firstPlayer: string,
  ): GameState {
    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const handSize = round;
    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, handSize).map(c => ({ ...c, faceUp: false })),
      score: existingScores[playerId] ?? 0,
      isOut: false,
      isBot: false,
    }));

    // Trump card = next card face-up
    const trumpCard = cards[0] ? { ...cards[0], faceUp: true } : null;
    const trumpSuit = (trumpCard?.suit ?? null) as Suit | null;

    const bids: Record<string, number> = {};
    const tricksTaken: Record<string, number> = {};
    for (const id of playerIds) {
      bids[id] = -1;
      tricksTaken[id] = 0;
    }

    const publicData: OhHellPublicData = {
      gamePhase: 'bidding',
      bids,
      tricksTaken,
      currentTrick: [],
      ledSuit: null,
      trumpSuit,
      trumpCard,
      currentRound: round,
      maxRound,
      dealerIndex,
      passCount: 0,
    };

    return {
      version: 1,
      roomId: config.roomId,
      gameId: config.gameId,
      phase: 'playing',
      players,
      currentTurn: firstPlayer,
      turnNumber: 1,
      roundNumber: round,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    const pd = state.publicData as unknown as OhHellPublicData;

    switch (action.type) {
      case 'bid': return this.handleBid(state, playerId, action, pd);
      case 'play': return this.handlePlay(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as OhHellPublicData;

    if (pd.gamePhase === 'bidding') {
      const maxBid = state.players[0]!.hand.length;
      return Array.from({ length: maxBid + 1 }, (_, i) => ({
        type: 'bid',
        payload: { amount: i },
      }));
    }

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

  private handleBid(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: OhHellPublicData,
  ): GameState {
    const amount = action.payload?.amount as number;
    if (amount < 0) throw new Error('Bid must be non-negative');

    const newBids = { ...pd.bids, [playerId]: amount };
    const allBid = Object.values(newBids).every(b => b >= 0);

    // Hoyle's "screw the dealer" rule: the dealer bids last, and the sum of
    // all bids cannot equal the number of tricks available (so at least one
    // player must miss their bid).
    const dealerId = state.players[pd.dealerIndex]!.playerId;
    if (playerId === dealerId) {
      const totalBids = Object.values(newBids).reduce((s, b) => s + b, 0);
      if (totalBids === pd.currentRound) {
        throw new Error(
          `Dealer's bid may not balance total bids to ${pd.currentRound}`,
        );
      }
    }

    const next = allBid ? state.players[(pd.dealerIndex + 1) % state.players.length]!.playerId
      : nextPlayer(state.players, playerId);

    return {
      ...state,
      version: state.version + 1,
      currentTurn: next,
      publicData: {
        ...pd,
        bids: newBids,
        gamePhase: allBid ? 'playing' : 'bidding',
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handlePlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: OhHellPublicData,
  ): GameState {
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    // Hoyle's: must follow led suit if possible.
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

    if (newTrick.length === state.players.length) {
      const winnerId = trickWinner(newTrick, pd.trumpSuit, ledSuit);
      const newTricksTaken = { ...pd.tricksTaken, [winnerId]: (pd.tricksTaken[winnerId] ?? 0) + 1 };

      const handOver = newPlayers.every(p => p.hand.length === 0);
      if (handOver) {
        // Score the round
        newPlayers = newPlayers.map(p => {
          const bid = pd.bids[p.playerId] ?? 0;
          const taken = newTricksTaken[p.playerId] ?? 0;
          const pts = taken === bid ? 10 + bid : -Math.abs(taken - bid);
          return { ...p, score: p.score + pts };
        });

        // Check if game over (all rounds played)
        const gameOver = pd.currentRound >= pd.maxRound;

        if (gameOver) {
          return {
            ...state,
            version: state.version + 1,
            phase: 'ended',
            players: newPlayers,
            currentTurn: null,
            publicData: {
              ...pd,
              tricksTaken: newTricksTaken,
              currentTrick: [],
              ledSuit: null,
            } as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          };
        }

        // Start next round
        const newDealerIndex = (pd.dealerIndex + 1) % state.players.length;
        const playerIds = state.players.map(p => p.playerId);
        const existingScores: Record<string, number> = {};
        for (const p of newPlayers) existingScores[p.playerId] = p.score;

        return this.dealRound(
          { roomId: state.roomId, gameId: state.gameId, playerIds, asyncMode: false, turnTimerSeconds: null },
          playerIds,
          pd.currentRound + 1,
          pd.maxRound,
          newDealerIndex,
          existingScores,
          playerIds[(newDealerIndex + 1) % playerIds.length]!,
        );
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
