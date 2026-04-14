/**
 * Hearts Game Engine
 *
 * 4 players, standard 52-card deck.
 * Deal 13 cards each. Pass 3 cards left (1st hand), right (2nd), across (3rd), hold (4th).
 * 2-of-clubs leads first trick. Follow suit if possible.
 * Hearts = 1 pt each; Queen of spades = 13 pts.
 * "Shoot the moon": all hearts + QS = 0 pts to self, 26 to others.
 * Win: last to reach 100 pts (lowest score wins).
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

interface HeartsPublicData {
  currentTrick: Array<{ playerId: string; card: Card }>;
  ledSuit: string | null;
  heartsBroken: boolean;
  tricksTaken: Record<string, number>;
  pointsThisHand: Record<string, number>;
  passPhase: boolean;
  passDirection: 'left' | 'right' | 'across' | 'hold';
  pendingPasses: Record<string, string[]>; // playerId -> card IDs to pass
  round: number;
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
  const ledCards = trick.filter(t => t.card.suit === ledSuit);
  return ledCards.reduce((best, t) => cardRank(t.card) > cardRank(best.card) ? t : best).playerId;
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

function cardPoints(card: Card): number {
  if (card.suit === 'hearts') return 1;
  if (card.suit === 'spades' && card.rank === 'Q') return 13;
  return 0;
}

function passDirectionFor(round: number): 'left' | 'right' | 'across' | 'hold' {
  const cycle = round % 4;
  if (cycle === 1) return 'left';
  if (cycle === 2) return 'right';
  if (cycle === 3) return 'across';
  return 'hold';
}

export class HeartsEngine implements IGameEngine {
  readonly gameId = 'hearts';
  readonly supportsAsync = false;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 4) throw new Error('Hearts requires exactly 4 players');

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

    const tricksTaken: Record<string, number> = {};
    const pointsThisHand: Record<string, number> = {};
    for (const id of playerIds) {
      tricksTaken[id] = 0;
      pointsThisHand[id] = 0;
    }

    const passDirection = passDirectionFor(1);
    const passPhase = passDirection !== 'hold';

    // Find who has 2 of clubs — they lead first
    const twoClubs = players.find(p => p.hand.some(c => c.suit === 'clubs' && c.rank === '2'));

    const publicData: HeartsPublicData = {
      currentTrick: [],
      ledSuit: null,
      heartsBroken: false,
      tricksTaken,
      pointsThisHand,
      passPhase,
      passDirection,
      pendingPasses: {},
      round: 1,
    };

    logger.debug('HeartsEngine.startGame', { roomId });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: passPhase ? playerIds[0]! : (twoClubs?.playerId ?? playerIds[0]!),
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    const pd = state.publicData as unknown as HeartsPublicData;

    switch (action.type) {
      case 'pass': return this.handlePass(state, playerId, action, pd);
      case 'play': return this.handlePlay(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as HeartsPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    if (pd.passPhase) {
      // Pass action requires 3 cards; we surface a single representative
      // action here (the set of passable combinations is C(13,3)=286 and
      // isn't useful for bot strategy). Bots/UI that need all combinations
      // can enumerate from the hand directly.
      if (player.hand.length < 3) return [];
      return [{ type: 'pass', cardIds: player.hand.slice(0, 3).map(c => c.id) }];
    }

    const isFirstTrick =
      pd.currentTrick.length === 0 &&
      state.players.every(p => p.hand.length === 13);

    // First trick: must lead 2 of clubs if you hold it.
    if (isFirstTrick && pd.currentTrick.length === 0) {
      const twoClubs = player.hand.find(c => c.suit === 'clubs' && c.rank === '2');
      if (twoClubs) {
        return [{ type: 'play', cardIds: [twoClubs.id] }];
      }
    }

    // Must follow led suit
    if (pd.ledSuit) {
      const led = player.hand.filter(c => c.suit === pd.ledSuit);
      if (led.length > 0) {
        // First-trick rule: no hearts or Q\u2660 on the opening trick unless void in clubs.
        if (isFirstTrick) {
          const safe = led.filter(c => !(c.suit === 'hearts' || (c.suit === 'spades' && c.rank === 'Q')));
          if (safe.length > 0) return safe.map(c => ({ type: 'play', cardIds: [c.id] }));
        }
        return led.map(c => ({ type: 'play', cardIds: [c.id] }));
      }
    }

    // Can't lead hearts unless broken (or only hearts in hand)
    if (!pd.ledSuit && !pd.heartsBroken) {
      const nonHearts = player.hand.filter(c => c.suit !== 'hearts');
      if (nonHearts.length > 0) return nonHearts.map(c => ({ type: 'play', cardIds: [c.id] }));
    }

    // First-trick rule (void in clubs): still may not play Q\u2660 or hearts.
    if (isFirstTrick) {
      const safe = player.hand.filter(c => !(c.suit === 'hearts' || (c.suit === 'spades' && c.rank === 'Q')));
      if (safe.length > 0) return safe.map(c => ({ type: 'play', cardIds: [c.id] }));
    }

    return player.hand.map(c => ({ type: 'play', cardIds: [c.id] }));
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

  private handlePass(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: HeartsPublicData,
  ): GameState {
    if (!pd.passPhase) throw new Error('Not in pass phase');
    const cardIds = action.cardIds ?? [];
    if (cardIds.length !== 3) throw new Error('Must pass exactly 3 cards');

    const player = state.players.find(p => p.playerId === playerId)!;
    const cardsToPass = player.hand.filter(c => cardIds.includes(c.id));
    if (cardsToPass.length !== 3) throw new Error('Cards not in hand');

    const newPending = { ...pd.pendingPasses, [playerId]: cardIds };
    const allPassed = state.players.every(p => newPending[p.playerId]?.length === 3);

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: p.hand.filter(c => !cardIds.includes(c.id)) } : p
    );

    if (allPassed) {
      // Exchange passes
      const playerIds = state.players.map(p => p.playerId);
      newPlayers = newPlayers.map((p, i) => {
        let fromIdx: number;
        if (pd.passDirection === 'left') fromIdx = (i + playerIds.length - 1) % playerIds.length;
        else if (pd.passDirection === 'right') fromIdx = (i + 1) % playerIds.length;
        else if (pd.passDirection === 'across') fromIdx = (i + 2) % playerIds.length;
        else fromIdx = i;

        const fromId = playerIds[fromIdx]!;
        const passedCardIds = newPending[fromId] ?? [];
        const passedCards = state.players
          .find(np => np.playerId === fromId)!
          .hand
          .filter(c => passedCardIds.includes(c.id));

        return { ...p, hand: [...p.hand, ...passedCards] };
      });

      // Find who has 2 of clubs
      const twoClubsPlayer = newPlayers.find(p => p.hand.some(c => c.suit === 'clubs' && c.rank === '2'));

      return {
        ...state,
        version: state.version + 1,
        players: newPlayers,
        currentTurn: twoClubsPlayer?.playerId ?? playerIds[0]!,
        publicData: {
          ...pd,
          passPhase: false,
          pendingPasses: {},
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    // Not all passed yet — next player
    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      currentTurn: nextPlayer(state.players, playerId),
      publicData: {
        ...pd,
        pendingPasses: newPending,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handlePlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: HeartsPublicData,
  ): GameState {
    if (pd.passPhase) throw new Error('Still in pass phase');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    // First trick = before any trick has been completed. At that point every
    // dealt card is either still in a hand or has been played into the
    // current trick, so hands + currentTrick cards sum to 52.
    const cardsRemaining =
      state.players.reduce((sum, p) => sum + p.hand.length, 0) +
      pd.currentTrick.length;
    const isFirstTrick = cardsRemaining === 52;
    // Hoyle's: opening trick must be led with 2\u2663 by whoever holds it.
    if (isFirstTrick && pd.currentTrick.length === 0) {
      const twoClubs = player.hand.find(c => c.suit === 'clubs' && c.rank === '2');
      if (twoClubs && card.id !== twoClubs.id) {
        throw new Error('First trick must be led with 2 of clubs');
      }
    }
    // Hoyle's: no hearts or Q\u2660 on the first trick (unless void in all other suits).
    if (isFirstTrick && (card.suit === 'hearts' || (card.suit === 'spades' && card.rank === 'Q'))) {
      const hasNonPenalty = player.hand.some(
        c => c.id !== card.id && !(c.suit === 'hearts' || (c.suit === 'spades' && c.rank === 'Q')),
      );
      if (hasNonPenalty) {
        throw new Error('Cannot play hearts or Queen of spades on the first trick');
      }
    }

    // Enforce follow-suit.
    if (pd.currentTrick.length > 0 && pd.ledSuit && card.suit !== pd.ledSuit) {
      const canFollow = player.hand.some(c => c.suit === pd.ledSuit);
      if (canFollow) throw new Error(`Must follow ${pd.ledSuit}`);
    }

    // Enforce "can't lead hearts until broken" unless only hearts in hand.
    if (pd.currentTrick.length === 0 && card.suit === 'hearts' && !pd.heartsBroken) {
      const hasNonHearts = player.hand.some(c => c.suit !== 'hearts');
      if (hasNonHearts) {
        throw new Error('Hearts have not been broken');
      }
    }

    const newHand = player.hand.filter(c => c.id !== cardId);
    const ledSuit = pd.currentTrick.length === 0 ? card.suit! : pd.ledSuit!;
    const heartsBroken = pd.heartsBroken || card.suit === 'hearts';
    const newTrick = [...pd.currentTrick, { playerId, card: { ...card, faceUp: true } }];

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand } : p
    );

    if (newTrick.length === 4) {
      // Resolve trick
      const winnerId = trickWinner(newTrick, ledSuit);
      const trickPts = newTrick.reduce((sum, t) => sum + cardPoints(t.card), 0);

      const newTricksTaken = { ...pd.tricksTaken, [winnerId]: (pd.tricksTaken[winnerId] ?? 0) + 1 };
      const newPoints = { ...pd.pointsThisHand, [winnerId]: (pd.pointsThisHand[winnerId] ?? 0) + trickPts };

      const handOver = newPlayers.every(p => p.hand.length === 0);

      if (handOver) {
        // Shoot the moon check
        const shooterId = Object.keys(newPoints).find(id => newPoints[id] === 26);
        let finalPoints = { ...newPoints };
        if (shooterId) {
          for (const id of Object.keys(finalPoints)) {
            finalPoints[id] = id === shooterId ? 0 : 26;
          }
        }

        newPlayers = newPlayers.map(p => ({
          ...p,
          score: p.score + (finalPoints[p.playerId] ?? 0),
        }));

        const loser = newPlayers.find(p => p.score >= 100);
        if (loser) {
          return {
            ...state,
            version: state.version + 1,
            phase: 'ended',
            players: newPlayers,
            currentTurn: null,
            publicData: {
              ...pd,
              currentTrick: [],
              ledSuit: null,
              heartsBroken,
              tricksTaken: newTricksTaken,
              pointsThisHand: newPoints,
            } as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          };
        }

        // New hand
        return this.startNewHand(state, newPlayers, pd);
      }

      return {
        ...state,
        version: state.version + 1,
        players: newPlayers,
        currentTurn: winnerId,
        publicData: {
          ...pd,
          currentTrick: [],
          ledSuit: null,
          heartsBroken,
          tricksTaken: newTricksTaken,
          pointsThisHand: newPoints,
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
        heartsBroken,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private startNewHand(
    state: GameState,
    players: GameState['players'],
    pd: HeartsPublicData,
  ): GameState {
    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const newPlayers = players.map(p => ({
      ...p,
      hand: cards.splice(0, 13).map(c => ({ ...c, faceUp: false })),
      isOut: false,
    }));

    const newRound = pd.round + 1;
    const passDirection = passDirectionFor(newRound);
    const passPhase = passDirection !== 'hold';

    const tricksTaken: Record<string, number> = {};
    const pointsThisHand: Record<string, number> = {};
    for (const p of players) {
      tricksTaken[p.playerId] = 0;
      pointsThisHand[p.playerId] = 0;
    }

    const twoClubsPlayer = passPhase
      ? null
      : newPlayers.find(p => p.hand.some(c => c.suit === 'clubs' && c.rank === '2'));

    return {
      ...state,
      version: state.version + 1,
      phase: 'playing',
      players: newPlayers,
      currentTurn: twoClubsPlayer?.playerId ?? players[0]!.playerId,
      roundNumber: state.roundNumber + 1,
      publicData: {
        ...pd,
        currentTrick: [],
        ledSuit: null,
        heartsBroken: false,
        tricksTaken,
        pointsThisHand,
        passPhase,
        passDirection,
        pendingPasses: {},
        round: newRound,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
