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

interface CrazyEightsHouseRules {
  multiSameRank?: boolean;
  playAfter8?: boolean;
  suitChain?: boolean;
}

interface CrazyEightsPublicData {
  drawPile: Card[];
  drawPileSize: number;
  discardPile: Card[];
  discardTop: Card | null;
  declaredSuit: string | null; // when 8 was played
  /** Active house-rule toggles for this room. */
  houseRules: CrazyEightsHouseRules;
  /**
   * When set, the same player must play one more card of `playAfter8Suit`
   * before the turn passes. Only used with the playAfter8 house rule.
   */
  playAfter8Suit: string | null;
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

    const rawHouseRules =
      (config.options?.['houseRules'] as CrazyEightsHouseRules | undefined) ?? {};
    const houseRules: CrazyEightsHouseRules = {
      multiSameRank: !!rawHouseRules.multiSameRank,
      playAfter8: !!rawHouseRules.playAfter8,
      suitChain: !!rawHouseRules.suitChain,
    };

    const publicData: CrazyEightsPublicData = {
      drawPile: cards,
      drawPileSize: cards.length,
      discardPile: [discardTop],
      discardTop,
      declaredSuit: null,
      houseRules,
      playAfter8Suit: null,
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
    const cardIds = action.cardIds ?? [];
    if (cardIds.length === 0) throw new Error('No card specified');

    const houseRules = pd.houseRules ?? {};
    const multiRankOn = !!houseRules.multiSameRank;
    const suitChainOn = !!houseRules.suitChain;
    const playAfter8On = !!houseRules.playAfter8;

    // Multi-card plays are only permitted when an explicit rule allows them.
    if (cardIds.length > 1 && !multiRankOn && !suitChainOn) {
      throw new Error('Multi-card plays are not enabled for this room');
    }

    const player = state.players.find(p => p.playerId === playerId)!;
    const cards: Card[] = cardIds.map((id) => {
      const card = player.hand.find(c => c.id === id);
      if (!card) throw new Error(`Card ${id} not in hand`);
      return card;
    });
    const firstCard = cards[0]!;
    const lastCard = cards[cards.length - 1]!;

    // When the table is mid-"play after 8", the opening card of this play
    // must match the suit declared by the previous 8 — the rule only grants
    // one extra card, not a full chain.
    if (pd.playAfter8Suit) {
      if (firstCard.rank === '8') {
        // allowed — playing another 8 restarts the wild chain
      } else if (firstCard.suit !== pd.playAfter8Suit) {
        throw new Error(
          `Must play a ${pd.playAfter8Suit} card after the 8`,
        );
      }
    } else if (!canPlay(firstCard, pd.discardTop, pd.declaredSuit)) {
      throw new Error('Card cannot be played');
    }

    // Validate any additional cards against the enabled rule(s).
    for (let i = 1; i < cards.length; i++) {
      const prev = cards[i - 1]!;
      const cur = cards[i]!;
      const sameRank = cur.rank === prev.rank;
      const sameSuit = cur.suit === prev.suit;
      if (multiRankOn && sameRank) continue;
      if (suitChainOn && (sameRank || sameSuit)) continue;
      throw new Error(
        multiRankOn
          ? 'All cards in a stack must share the same rank'
          : 'Each card must match the previous by rank or suit',
      );
    }

    const cardIdSet = new Set(cardIds);
    const newHand = player.hand.filter(c => !cardIdSet.has(c.id));
    const facedUp = cards.map(c => ({ ...c, faceUp: true }));
    const newDiscardPile = [...pd.discardPile, ...facedUp];
    const newDiscardTop = facedUp[facedUp.length - 1]!;

    // If the final card played is an 8, declare a suit. Otherwise any prior
    // declared-suit lock from an earlier 8 clears because a real card landed
    // on top.
    const lastIsEight = lastCard.rank === '8';
    const declaredSuit = lastIsEight
      ? ((action.payload?.['suit'] as string) ?? lastCard.suit ?? 'hearts')
      : null;

    // playAfter8 bookkeeping: an 8 at the end of this play entitles the same
    // player to one extra card of the declared suit on a follow-up action.
    // Playing the follow-up card clears the lock.
    const playAfter8Suit =
      playAfter8On && lastIsEight
        ? declaredSuit
        : null;

    const wentOut = newHand.length === 0;
    const keepTurn = !wentOut && !!playAfter8Suit;

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
      currentTurn: wentOut
        ? null
        : keepTurn
          ? playerId
          : nextPlayer(state.players, playerId),
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        discardPile: newDiscardPile,
        discardTop: newDiscardTop,
        declaredSuit,
        playAfter8Suit,
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
