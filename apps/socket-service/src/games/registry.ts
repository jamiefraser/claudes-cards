/**
 * GameRegistry
 *
 * Central registry for all IGameEngine and IBotStrategy implementations.
 * Engines are registered by gameId. Strategies are optional per engine.
 */

import type { IGameEngine, IBotStrategy } from '@card-platform/shared-types';
import { logger } from '../utils/logger';

/**
 * Normalize a game identifier so the DB's kebab-case ('gin-rummy') and the
 * engine-side one-word form ('ginrummy') resolve to the same key.
 */
function normalize(gameId: string): string {
  return gameId.toLowerCase().replace(/[-_\s]/g, '');
}

export class GameRegistry {
  private engines: Map<string, IGameEngine> = new Map();
  private strategies: Map<string, IBotStrategy> = new Map();

  /**
   * Register an engine and optional bot strategy. Keys are stored in
   * normalized form so callers may look up with either kebab-case
   * ('gin-rummy') or one-word form ('ginrummy').
   * If called twice with the same gameId, the later registration wins.
   */
  register(engine: IGameEngine, strategy?: IBotStrategy): void {
    const key = normalize(engine.gameId);
    logger.info('GameRegistry: registering engine', { gameId: engine.gameId, key });
    this.engines.set(key, engine);
    if (strategy) {
      this.strategies.set(key, strategy);
    }
  }

  /**
   * Retrieve the engine for the given gameId.
   * Throws if no engine is registered for that gameId.
   */
  getEngine(gameId: string): IGameEngine {
    const engine = this.engines.get(normalize(gameId));
    if (!engine) {
      throw new Error(`No engine registered for gameId: ${gameId}`);
    }
    return engine;
  }

  /**
   * Retrieve the bot strategy for the given gameId.
   * Returns undefined if no strategy is registered.
   */
  getStrategy(gameId: string): IBotStrategy | undefined {
    return this.strategies.get(normalize(gameId));
  }
}
