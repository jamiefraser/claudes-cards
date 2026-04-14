/**
 * Game engine interface and related types.
 * Every game engine in socket-service/src/games/ must implement IGameEngine.
 */
import type { GameState, PlayerAction, GamePhase } from './gameState.js';

/**
 * Configuration passed to the game engine when startGame is called.
 */
export interface GameConfig {
  roomId: string;
  gameId: string;
  playerIds: string[];
  /** Additional game-specific configuration options. */
  options?: Record<string, unknown>;
  asyncMode: boolean;
  /** Turn timer in seconds. Null for real-time games. */
  turnTimerSeconds: number | null;
}

/**
 * A ranked result for one player at the end of a game.
 * Used by computeResult and consumed by the leaderboard worker.
 */
export interface PlayerRanking {
  playerId: string;
  displayName: string;
  rank: number;        // 1 = first place
  score: number;
  /** If true, this ranking is excluded from leaderboards (bot seat). */
  isBot: boolean;
}

/**
 * Interface that every game engine must implement.
 * Located in socket-service/src/games/{gameId}/engine.ts.
 */
export interface IGameEngine {
  readonly gameId: string;
  /** Whether this game supports async (turn-timer) play. */
  readonly supportsAsync: boolean;
  /** Min and max player counts. */
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /**
   * Initialise state and deal cards.
   * Returns the initial GameState with version=1.
   */
  startGame(config: GameConfig): GameState;

  /**
   * Apply a player action to the current state.
   * Returns the updated GameState with an incremented version.
   * Throws if the action is invalid.
   */
  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState;

  /**
   * Return all actions the given player may legally take in the current state.
   * Used by bots and optionally by the frontend to highlight valid moves.
   */
  getValidActions(state: GameState, playerId: string): PlayerAction[];

  /**
   * Compute the final ranking once the game is over.
   * Called after isGameOver returns true.
   */
  computeResult(state: GameState): PlayerRanking[];

  /**
   * Return true if the game has ended (a player has won or all players have finished).
   */
  isGameOver(state: GameState): boolean;
}
