/**
 * Gin Rummy Game Engine
 *
 * Standard 52-card deck, exactly 2 players.
 * Deal 10 cards each.
 * Turn: draw, then discard or knock.
 * Knock: deadwood ≤ 10 pts (face cards = 10, A = 1).
 * Gin: deadwood = 0 (25 pt bonus).
 * Win: first to 100 points.
 *
 * Scoring is simplified — TODO: full undercut logic.
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

interface GinRummyPublicData {
  drawPile: Card[];
  drawPileSize: number;
  discardPile: Card[];
  discardTop: Card | null;
  turnPhase: 'draw' | 'discard';
  knocked: string | null; // playerId who knocked
  knockDeadwood: number;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function rankVal(rank: string): number {
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

const RANK_ORDER: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

function cardPt(c: Card): number {
  return rankVal(c.rank ?? 'A');
}

/**
 * Compute deadwood points for a Gin Rummy hand under Hoyle's rules.
 *
 * Per Hoyle's, melds are either:
 *   - Sets:  3 or 4 cards of the same rank.
 *   - Runs:  3+ cards of the same suit with consecutive ranks (A-low; no A-K wrap).
 *
 * The same card cannot be used in two melds. We search for the arrangement
 * that minimises the unmatched (deadwood) card-point total \u2014 brute force is
 * acceptable at 10\u201311 cards.
 */
export function computeDeadwood(hand: Card[]): number {
  const total = hand.reduce((s, c) => s + cardPt(c), 0);

  // Enumerate every candidate meld (valid set or run) by index.
  const candidates: number[][] = [];

  // Sets: 3 or 4 of a rank.
  const byRank: Record<string, number[]> = {};
  hand.forEach((c, i) => {
    const r = c.rank ?? '';
    byRank[r] = byRank[r] ?? [];
    byRank[r]!.push(i);
  });
  for (const idxs of Object.values(byRank)) {
    if (idxs.length >= 3) {
      candidates.push([...idxs]);
      if (idxs.length === 4) {
        for (let skip = 0; skip < 4; skip++) {
          candidates.push(idxs.filter((_, j) => j !== skip));
        }
      }
    }
  }

  // Runs: 3+ consecutive ranks in the same suit (Ace low; no A-K wrap).
  const bySuit: Record<string, Array<{ idx: number; rank: number }>> = {};
  hand.forEach((c, i) => {
    const s = c.suit ?? '';
    const r = RANK_ORDER[c.rank ?? ''] ?? 0;
    bySuit[s] = bySuit[s] ?? [];
    bySuit[s]!.push({ idx: i, rank: r });
  });
  for (const entries of Object.values(bySuit)) {
    const sorted = [...entries].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 2; j < sorted.length; j++) {
        let ok = true;
        for (let k = i + 1; k <= j; k++) {
          if (sorted[k]!.rank !== sorted[k - 1]!.rank + 1) { ok = false; break; }
        }
        if (ok) {
          candidates.push(sorted.slice(i, j + 1).map((e) => e.idx));
        }
      }
    }
  }

  // DFS over disjoint combinations; track minimum deadwood.
  let minDead = total;
  const dfs = (startIdx: number, used: boolean[], meldedPts: number): void => {
    const deadwood = total - meldedPts;
    if (deadwood < minDead) minDead = deadwood;
    if (startIdx >= candidates.length) return;
    for (let i = startIdx; i < candidates.length; i++) {
      const cand = candidates[i]!;
      if (cand.some((idx) => used[idx])) continue;
      for (const idx of cand) used[idx] = true;
      const pts = cand.reduce((s, idx) => s + cardPt(hand[idx]!), 0);
      dfs(i + 1, used, meldedPts + pts);
      for (const idx of cand) used[idx] = false;
    }
  };
  dfs(0, Array(hand.length).fill(false), 0);

  return minDead;
}

function nextPlayer(players: GameState['players'], currentId: string): string {
  const idx = players.findIndex(p => p.playerId === currentId);
  return players[(idx + 1) % players.length]!.playerId;
}

export class GinRummyEngine implements IGameEngine {
  readonly gameId = 'ginrummy';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 2;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length !== 2) throw new Error('Gin Rummy requires exactly 2 players');

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const players = playerIds.map(playerId => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, 10).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
    }));

    const discardCard = cards.splice(0, 1)[0]!;
    const discardTop = { ...discardCard, faceUp: true };

    const publicData: GinRummyPublicData = {
      drawPile: cards,
      drawPileSize: cards.length,
      discardPile: [discardTop],
      discardTop,
      turnPhase: 'draw',
      knocked: null,
      knockDeadwood: 0,
    };

    logger.debug('GinRummyEngine.startGame', { roomId });

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
    const pd = state.publicData as unknown as GinRummyPublicData;

    switch (action.type) {
      case 'draw': return this.handleDraw(state, playerId, action, pd);
      case 'discard': return this.handleDiscard(state, playerId, action, pd);
      case 'knock': return this.handleKnock(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as GinRummyPublicData;
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return [];

    if (pd.turnPhase === 'draw') {
      const actions: PlayerAction[] = [{ type: 'draw', payload: { source: 'deck' } }];
      if (pd.discardTop) actions.push({ type: 'draw', payload: { source: 'discard' } });
      return actions;
    }

    const actions: PlayerAction[] = player.hand.map(c => ({ type: 'discard', cardIds: [c.id] }));
    if (computeDeadwood(player.hand) <= 10) {
      actions.push({ type: 'knock' });
    }
    return actions;
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

  private handleDraw(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: GinRummyPublicData,
  ): GameState {
    if (pd.turnPhase !== 'draw') throw new Error('Already drew this turn');
    const source = (action.payload?.source as string) ?? 'deck';
    let newDraw = [...pd.drawPile];
    let newDiscard = [...pd.discardPile];
    let drawn: Card;

    if (source === 'discard') {
      if (newDiscard.length === 0) throw new Error('Discard pile empty');
      drawn = newDiscard.pop()!;
    } else {
      if (newDraw.length === 0) {
        if (newDiscard.length <= 1) throw new Error('No cards to draw');
        const top = newDiscard.pop()!;
        newDraw = newDiscard;
        shuffle(newDraw);
        newDiscard = [top];
      }
      drawn = newDraw.pop()!;
    }

    const discardTop = newDiscard.length > 0 ? newDiscard[newDiscard.length - 1]! : null;

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === playerId ? { ...p, hand: [...p.hand, { ...drawn, faceUp: false }] } : p
      ),
      publicData: {
        ...pd,
        drawPile: newDraw,
        drawPileSize: newDraw.length,
        discardPile: newDiscard,
        discardTop,
        turnPhase: 'discard',
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleDiscard(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: GinRummyPublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') throw new Error('Must draw first');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    const newHand = player.hand.filter(c => c.id !== cardId);
    const faceUp = { ...card, faceUp: true };
    const newDiscardPile = [...pd.discardPile, faceUp];

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
        discardPile: newDiscardPile,
        discardTop: faceUp,
        turnPhase: 'draw',
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleKnock(
    state: GameState,
    playerId: string,
    _action: PlayerAction,
    pd: GinRummyPublicData,
  ): GameState {
    if (pd.turnPhase !== 'discard') throw new Error('Must draw before knocking');
    const player = state.players.find(p => p.playerId === playerId)!;
    const deadwood = computeDeadwood(player.hand);
    if (deadwood > 10) throw new Error(`Deadwood ${deadwood} too high to knock`);

    const isGin = deadwood === 0;
    const opponent = state.players.find(p => p.playerId !== playerId)!;
    const oppDeadwood = computeDeadwood(opponent.hand);

    // Hoyle's scoring:
    //   - Gin: knocker scores opp's full deadwood + 25 gin bonus.
    //   - Normal knock won: knocker scores (opp's deadwood \u2212 knocker's deadwood).
    //   - Undercut: if opp's deadwood \u2264 knocker's deadwood (and knocker did not
    //     go gin), the OPPONENT scores the difference plus a 25-point undercut
    //     bonus.
    let knockerPts = 0;
    let oppPts = 0;
    if (isGin) {
      knockerPts = oppDeadwood + 25;
    } else if (oppDeadwood <= deadwood) {
      oppPts = deadwood - oppDeadwood + 25;
    } else {
      knockerPts = oppDeadwood - deadwood;
    }

    const newPlayers = state.players.map(p => {
      if (p.playerId === playerId) {
        return { ...p, score: p.score + knockerPts, isOut: true };
      }
      return { ...p, score: p.score + oppPts, isOut: false };
    });

    // Check win condition (100 pts)
    const winner = newPlayers.find(p => p.score >= 100);

    return {
      ...state,
      version: state.version + 1,
      phase: winner ? 'ended' : 'scoring',
      players: newPlayers,
      currentTurn: null,
      publicData: {
        ...pd,
        knocked: playerId,
        knockDeadwood: deadwood,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
