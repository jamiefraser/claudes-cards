/**
 * Spades Game Engine
 *
 * 4 players, standard 52-card deck.
 * Partnerships: (p0+p2) vs (p1+p3).
 * Deal 13 cards each.
 * Bid: each player bids how many tricks they'll win.
 * Spades always trump; lead suit must be followed if possible.
 * Scoring: bid * 10 pts if made; overtricks (bags) penalize at 10.
 * Nil bid = 100 pts bonus or -100.
 * Win: first team to 500 pts.
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

type SpadesPhase = 'bidding' | 'playing' | 'scoring';

interface SpadesPublicData {
  gamePhase: SpadesPhase;
  bids: Record<string, number>;
  tricksTaken: Record<string, number>;
  currentTrick: Array<{ playerId: string; card: Card }>;
  ledSuit: string | null;
  spadesBroken: boolean;
  teamScores: Record<string, number>; // teamA, teamB
  dealerIndex: number;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function cardRank(card: Card): number {
  if (!card.rank) return 0;
  const map: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
  };
  return map[card.rank] ?? 0;
}

function trickWinner(trick: Array<{ playerId: string; card: Card }>, ledSuit: string): string {
  // Spades beat all; led suit beats other suits
  const spades = trick.filter(t => t.card.suit === 'spades');
  if (spades.length > 0) {
    return spades.reduce((best, t) => cardRank(t.card) > cardRank(best.card) ? t : best).playerId;
  }
  const ledCards = trick.filter(t => t.card.suit === ledSuit);
  return ledCards.reduce((best, t) => cardRank(t.card) > cardRank(best.card) ? t : best).playerId;
}

function teamOf(playerIds: string[], playerId: string): string {
  const idx = playerIds.indexOf(playerId);
  return idx % 2 === 0 ? 'teamA' : 'teamB';
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class SpadesEngine implements IGameEngine {
  readonly gameId = 'spades';
  readonly supportsAsync = false;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 4) throw new Error('Spades requires exactly 4 players');

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, 13).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    const bids: Record<string, number> = {};
    const tricksTaken: Record<string, number> = {};
    for (const id of playerIds) {
      bids[id] = -1; // not yet bid
      tricksTaken[id] = 0;
    }

    const publicData: SpadesPublicData = {
      gamePhase: 'bidding',
      bids,
      tricksTaken,
      currentTrick: [],
      ledSuit: null,
      spadesBroken: false,
      teamScores: { teamA: 0, teamB: 0 },
      dealerIndex: 0,
    };

    logger.debug('SpadesEngine.startGame', { roomId });

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
    const pd = state.publicData as unknown as SpadesPublicData;

    switch (action.type) {
      case 'bid': return this.handleBid(state, playerId, action, pd);
      case 'play': return this.handlePlay(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as SpadesPublicData;

    if (pd.gamePhase === 'bidding') {
      return Array.from({ length: 14 }, (_, i) => ({ type: 'bid', payload: { amount: i } }));
    }

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    if (pd.ledSuit) {
      const ledSuitCards = player.hand.filter(c => c.suit === pd.ledSuit);
      if (ledSuitCards.length > 0) {
        return ledSuitCards.map(c => ({ type: 'play', cardIds: [c.id] }));
      }
    }

    // Can play anything (spades if broken or only have spades)
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
    pd: SpadesPublicData,
  ): GameState {
    if (pd.gamePhase !== 'bidding') throw new Error('Not in bidding phase');
    const amount = action.payload?.amount as number;
    if (amount < 0 || amount > 13) throw new Error('Bid must be 0–13');

    const newBids = { ...pd.bids, [playerId]: amount };
    const allBid = Object.values(newBids).every(b => b >= 0);
    const next = allBid ? null : nextPlayer(state.players, playerId);

    return {
      ...state,
      version: state.version + 1,
      currentTurn: allBid ? state.players[(pd.dealerIndex + 1) % 4]!.playerId : next,
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
    pd: SpadesPublicData,
  ): GameState {
    if (pd.gamePhase !== 'playing') throw new Error('Not in playing phase');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    // Hoyle's: a player may not lead spades until they have been "broken"
    // (played on an off-suit trick) unless they hold nothing but spades.
    if (pd.currentTrick.length === 0 && card.suit === 'spades' && !pd.spadesBroken) {
      const hasNonSpade = player.hand.some((c) => c.suit !== 'spades');
      if (hasNonSpade) throw new Error('Spades have not been broken');
    }

    // Follow-suit enforcement.
    if (pd.currentTrick.length > 0 && pd.ledSuit && card.suit !== pd.ledSuit) {
      const canFollow = player.hand.some((c) => c.suit === pd.ledSuit);
      if (canFollow) throw new Error(`Must follow ${pd.ledSuit}`);
    }

    const newHand = player.hand.filter(c => c.id !== cardId);
    const ledSuit = pd.currentTrick.length === 0 ? card.suit! : pd.ledSuit!;
    const spadesBroken = pd.spadesBroken || card.suit === 'spades';
    const newTrick = [...pd.currentTrick, { playerId, card: { ...card, faceUp: true } }];

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand } : p
    );
    let newPd: SpadesPublicData;

    if (newTrick.length === 4) {
      // Resolve trick
      const winnerId = trickWinner(newTrick, ledSuit);
      const newTricksTaken = { ...pd.tricksTaken, [winnerId]: (pd.tricksTaken[winnerId] ?? 0) + 1 };

      // Check if hand over
      const handOver = newPlayers.every(p => p.hand.length === 0);
      if (handOver) {
        // Score the hand
        const playerIds = state.players.map(p => p.playerId);
        let newTeamScores = { ...pd.teamScores };

        // Hoyle's Spades scoring: each player contributes a per-player nil
        // bonus/penalty (\u00b1100). The rest of the contract scores at the team
        // level \u2014 sum of non-nil bids \u00d7 10 if met, \u00b11 per bag. Ten accumulated
        // bags cost a team 100 pts; we don't track cross-hand bags in this
        // iteration so the 10-bag penalty is applied to the current hand only.
        for (const team of ['teamA', 'teamB']) {
          const members = playerIds.filter((_, i) => (i % 2 === 0 ? 'teamA' : 'teamB') === team);

          let nilAdjust = 0;
          let contractBid = 0;
          let contractTricks = 0;
          for (const id of members) {
            const bid = pd.bids[id] ?? 0;
            const tricks = newTricksTaken[id] ?? 0;
            if (bid === 0) {
              nilAdjust += tricks === 0 ? 100 : -100;
              contractTricks += tricks; // partner still covered by contract
            } else {
              contractBid += bid;
              contractTricks += tricks;
            }
          }

          const contractPts = contractTricks >= contractBid
            ? contractBid * 10 + Math.max(0, contractTricks - contractBid)
            : -(contractBid * 10);

          newTeamScores[team] = (newTeamScores[team] ?? 0) + contractPts + nilAdjust;
        }

        // Update player scores from team
        newPlayers = newPlayers.map(p => {
          const team = teamOf(playerIds, p.playerId);
          return { ...p, score: newTeamScores[team] ?? 0 };
        });

        const winner = Object.entries(newTeamScores).find(([, s]) => s >= 500);

        newPd = {
          ...pd,
          tricksTaken: newTricksTaken,
          currentTrick: [],
          ledSuit: null,
          spadesBroken,
          teamScores: newTeamScores,
          gamePhase: winner ? 'scoring' : 'playing',
        };

        return {
          ...state,
          version: state.version + 1,
          phase: winner ? 'ended' : 'playing',
          players: newPlayers,
          currentTurn: winner ? null : winnerId,
          publicData: newPd as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        };
      }

      newPd = {
        ...pd,
        tricksTaken: newTricksTaken,
        currentTrick: [],
        ledSuit: null,
        spadesBroken,
      };

      return {
        ...state,
        version: state.version + 1,
        players: newPlayers,
        currentTurn: winnerId,
        publicData: newPd as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    newPd = {
      ...pd,
      currentTrick: newTrick,
      ledSuit,
      spadesBroken,
    };

    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      currentTurn: nextPlayer(state.players, playerId),
      publicData: newPd as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
