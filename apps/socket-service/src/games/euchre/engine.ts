/**
 * Euchre Game Engine
 *
 * 4 players, 24-card deck (9–A in each suit).
 * Partnerships: (p0+p2) vs (p1+p3).
 * Deal 5 cards each; flip up-card for trump selection.
 * Order-up or pass. Maker calls trump.
 * Bowers: Jack of trump = Right Bower (highest); Jack of same-color suit = Left Bower.
 * Win tricks; maker must win 3+ of 5.
 * Score: 2 pts for all 5 (march); 1 pt for 3–4; going alone: 4 pts.
 * First team to 10 pts wins.
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
import { createStandardCard } from '@card-platform/cards-engine';
import { logger } from '../../utils/logger';

type EuchrePhase = 'trump-select' | 'playing';

interface EuchrePublicData {
  gamePhase: EuchrePhase;
  upCard: Card | null;
  trumpSuit: Suit | null;
  maker: string | null;
  currentTrick: Array<{ playerId: string; card: Card }>;
  ledSuit: string | null;
  tricksTaken: Record<string, number>;
  teamScores: Record<string, number>;
  dealerIndex: number;
  trumpRound: number; // 1 = order up, 2 = name trump
  passCount: number;
}

const EUCHRE_RANKS = ['9', '10', 'J', 'Q', 'K', 'A'] as const;
type EuchreRank = typeof EUCHRE_RANKS[number];
const RANK_VALUES: Record<string, number> = { '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function buildEuchreDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const cards: Card[] = [];
  for (const suit of suits) {
    for (const rank of EUCHRE_RANKS) {
      const val = RANK_VALUES[rank] ?? 0;
      // EuchreRank is a subset of Rank, safe cast
      cards.push(createStandardCard(suit, rank as import('@card-platform/shared-types').Rank, val));
    }
  }
  return cards;
}

function sameColorSuit(suit: Suit): Suit {
  if (suit === 'hearts') return 'diamonds';
  if (suit === 'diamonds') return 'hearts';
  if (suit === 'clubs') return 'spades';
  return 'clubs';
}

function cardStrength(card: Card, trump: Suit, ledSuit: Suit | null): number {
  // Right bower
  if (card.rank === 'J' && card.suit === trump) return 100;
  // Left bower
  if (card.rank === 'J' && card.suit === sameColorSuit(trump)) return 99;
  if (card.suit === trump) return 50 + (RANK_VALUES[card.rank ?? ''] ?? 0);
  if (ledSuit && card.suit === ledSuit) return RANK_VALUES[card.rank ?? ''] ?? 0;
  return 0;
}

function trickWinner(trick: Array<{ playerId: string; card: Card }>, trump: Suit, ledSuit: Suit): string {
  return trick.reduce((best, t) => {
    const s = cardStrength(t.card, trump, ledSuit);
    const bs = cardStrength(best.card, trump, ledSuit);
    return s > bs ? t : best;
  }).playerId;
}

function teamOf(playerIds: string[], playerId: string): string {
  const idx = playerIds.indexOf(playerId);
  return idx % 2 === 0 ? 'teamA' : 'teamB';
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class EuchreEngine implements IGameEngine {
  readonly gameId = 'euchre';
  readonly supportsAsync = false;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 4) throw new Error('Euchre requires exactly 4 players');

    const cards = buildEuchreDeck();
    shuffle(cards);

    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, 5).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    // Up card (would normally be 4 cards in the kitty)
    const upCard = cards[0] ? { ...cards[0], faceUp: true } : null;

    const tricksTaken: Record<string, number> = {};
    for (const id of playerIds) tricksTaken[id] = 0;

    const publicData: EuchrePublicData = {
      gamePhase: 'trump-select',
      upCard,
      trumpSuit: null,
      maker: null,
      currentTrick: [],
      ledSuit: null,
      tricksTaken,
      teamScores: { teamA: 0, teamB: 0 },
      dealerIndex: 0,
      trumpRound: 1,
      passCount: 0,
    };

    logger.debug('EuchreEngine.startGame', { roomId });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[1]!, // Player left of dealer leads first in trump selection
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    const pd = state.publicData as unknown as EuchrePublicData;

    switch (action.type) {
      case 'order-up': return this.handleOrderUp(state, playerId, pd);
      case 'pass-trump': return this.handlePassTrump(state, playerId, pd);
      case 'call-trump': return this.handleCallTrump(state, playerId, action, pd);
      case 'play': return this.handlePlay(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as EuchrePublicData;

    if (pd.gamePhase === 'trump-select') {
      if (pd.trumpRound === 1) {
        return [{ type: 'order-up' }, { type: 'pass-trump' }];
      }
      // Round 2: name a suit (not the turned-down suit)
      return [
        { type: 'call-trump', payload: { suit: 'hearts' } },
        { type: 'call-trump', payload: { suit: 'diamonds' } },
        { type: 'call-trump', payload: { suit: 'clubs' } },
        { type: 'call-trump', payload: { suit: 'spades' } },
        { type: 'pass-trump' },
      ];
    }

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];
    if (pd.ledSuit) {
      const trump = pd.trumpSuit!;
      // Account for left bower being trump suit
      const ledCards = player.hand.filter(c => {
        if (c.rank === 'J' && c.suit === sameColorSuit(trump)) return pd.ledSuit === trump;
        return c.suit === pd.ledSuit;
      });
      if (ledCards.length > 0) return ledCards.map(c => ({ type: 'play', cardIds: [c.id] }));
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

  private handleOrderUp(state: GameState, playerId: string, pd: EuchrePublicData): GameState {
    const trump = pd.upCard?.suit ?? 'spades';
    const tricksTaken: Record<string, number> = {};
    for (const p of state.players) tricksTaken[p.playerId] = 0;

    // Dealer discards a card (auto: discard lowest)
    const dealer = state.players[pd.dealerIndex]!;
    const sorted = [...dealer.hand].sort((a, b) => (RANK_VALUES[a.rank ?? ''] ?? 0) - (RANK_VALUES[b.rank ?? ''] ?? 0));
    const discard = sorted[0];
    const dealerNewHand = discard ? dealer.hand.filter(c => c.id !== discard.id) : dealer.hand;

    const firstLead = state.players[(pd.dealerIndex + 1) % 4]!.playerId;

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === dealer.playerId ? { ...p, hand: dealerNewHand } : p
      ),
      currentTurn: firstLead,
      publicData: {
        ...pd,
        gamePhase: 'playing',
        trumpSuit: trump as Suit,
        maker: playerId,
        tricksTaken,
        currentTrick: [],
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handlePassTrump(state: GameState, playerId: string, pd: EuchrePublicData): GameState {
    const newPassCount = pd.passCount + 1;
    // After 4 passes in round 1 → round 2; after 4 passes in round 2 → redeal (simplified: dealer calls)
    let trumpRound = pd.trumpRound;
    let passCount = newPassCount;

    if (newPassCount >= 4) {
      trumpRound = trumpRound === 1 ? 2 : 1;
      passCount = 0;
    }

    const nextTurn = newPassCount >= 4 && trumpRound === 2
      ? state.players[(pd.dealerIndex + 1) % 4]!.playerId
      : nextPlayer(state.players, playerId);

    return {
      ...state,
      version: state.version + 1,
      currentTurn: nextTurn,
      publicData: {
        ...pd,
        trumpRound,
        passCount,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleCallTrump(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: EuchrePublicData,
  ): GameState {
    const suit = action.payload?.suit as Suit;
    if (!suit) throw new Error('Must specify a suit');
    // Hoyle's: in round 2 the suit of the turned-down up-card may not be
    // called ("turn it down, pick up for a grand slam").
    if (pd.trumpRound === 2 && pd.upCard && suit === pd.upCard.suit) {
      throw new Error('Cannot name the turned-down suit as trump');
    }
    const tricksTaken: Record<string, number> = {};
    for (const p of state.players) tricksTaken[p.playerId] = 0;

    const firstLead = state.players[(pd.dealerIndex + 1) % 4]!.playerId;

    return {
      ...state,
      version: state.version + 1,
      currentTurn: firstLead,
      publicData: {
        ...pd,
        gamePhase: 'playing',
        trumpSuit: suit,
        maker: playerId,
        tricksTaken,
        currentTrick: [],
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handlePlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: EuchrePublicData,
  ): GameState {
    if (pd.gamePhase !== 'playing') throw new Error('Not in playing phase');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    const trump = pd.trumpSuit!;
    // Effective suit of a card: left bower plays as trump.
    const effSuit = (c: Card): Suit => {
      if (c.rank === 'J' && c.suit === sameColorSuit(trump)) return trump;
      return (c.suit ?? trump) as Suit;
    };
    // Enforce follow-suit per Hoyle's, treating the left bower as trump.
    if (pd.currentTrick.length > 0 && pd.ledSuit && effSuit(card) !== pd.ledSuit) {
      const canFollow = player.hand.some(
        (c) => c.id !== card.id && effSuit(c) === pd.ledSuit,
      );
      if (canFollow) throw new Error(`Must follow ${pd.ledSuit}`);
    }
    const ledSuit = pd.currentTrick.length === 0 ? effSuit(card) : pd.ledSuit!;
    const newTrick = [...pd.currentTrick, { playerId, card: { ...card, faceUp: true } }];
    const newHand = player.hand.filter(c => c.id !== cardId);

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand } : p
    );

    if (newTrick.length === 4) {
      const winnerId = trickWinner(newTrick, trump, ledSuit as Suit);
      const newTricksTaken = { ...pd.tricksTaken, [winnerId]: (pd.tricksTaken[winnerId] ?? 0) + 1 };

      const handOver = newPlayers.every(p => p.hand.length === 0);
      if (handOver) {
        // Score the hand
        const playerIds = state.players.map(p => p.playerId);
        const makerTeam = pd.maker ? teamOf(playerIds, pd.maker) : 'teamA';
        const otherTeam = makerTeam === 'teamA' ? 'teamB' : 'teamA';

        const makerTricks = playerIds
          .filter((_, i) => (i % 2 === 0 ? 'teamA' : 'teamB') === makerTeam)
          .reduce((s, id) => s + (newTricksTaken[id] ?? 0), 0);

        let makerPts = 0;
        if (makerTricks === 5) makerPts = 2; // march
        else if (makerTricks >= 3) makerPts = 1;
        else makerPts = -2; // euchred (opponent gets 2)

        const newTeamScores = { ...pd.teamScores };
        if (makerPts > 0) {
          newTeamScores[makerTeam] = (newTeamScores[makerTeam] ?? 0) + makerPts;
        } else {
          newTeamScores[otherTeam] = (newTeamScores[otherTeam] ?? 0) + 2;
        }

        newPlayers = newPlayers.map(p => {
          const team = teamOf(playerIds, p.playerId);
          return { ...p, score: newTeamScores[team] ?? 0 };
        });

        const winner = Object.entries(newTeamScores).find(([, s]) => s >= 10);

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
