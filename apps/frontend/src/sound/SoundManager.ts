/**
 * SoundManager — singleton that manages Howler.js instances.
 * SPEC.md §10.2
 *
 * Sound asset files are placed by the devops agent.
 * This module only references the paths — it does not download files.
 */
import { Howl } from 'howler';
import type { SoundEvent } from '@shared/sound';
import { logger } from '@/utils/logger';

const ASSET_BASE = '/src/sound/assets';

const SOUND_PATHS: Record<SoundEvent, string> = {
  'card-deal':       `${ASSET_BASE}/card-deal.mp3`,
  'card-flip':       `${ASSET_BASE}/card-flip.mp3`,
  'card-discard':    `${ASSET_BASE}/card-discard.mp3`,
  'card-draw':       `${ASSET_BASE}/card-draw.mp3`,
  'card-shuffle':    `${ASSET_BASE}/card-shuffle.mp3`,
  'phase-complete':  `${ASSET_BASE}/phase-complete.mp3`,
  'round-win':       `${ASSET_BASE}/round-win.mp3`,
  'game-win':        `${ASSET_BASE}/game-win.mp3`,
  'game-lose':       `${ASSET_BASE}/game-lose.mp3`,
  'skip-played':     `${ASSET_BASE}/skip-played.mp3`,
  'notification':    `${ASSET_BASE}/notification.mp3`,
  'peg-move':        `${ASSET_BASE}/peg-move.mp3`,
};

class SoundManager {
  private sounds: Map<SoundEvent, Howl> = new Map();
  private enabled: boolean = true;
  private volume: number = 0.7;

  private getOrCreate(event: SoundEvent): Howl {
    if (!this.sounds.has(event)) {
      this.sounds.set(
        event,
        new Howl({
          src: [SOUND_PATHS[event]],
          volume: this.volume,
          preload: false,
          onloaderror: (_id, err) => {
            logger.warn(`SoundManager: failed to load ${event}`, { err });
          },
        }),
      );
    }
    // Non-null assertion safe: we just set it above
    return this.sounds.get(event)!;
  }

  play(event: SoundEvent): void {
    if (!this.enabled) return;
    try {
      this.getOrCreate(event).play();
      logger.debug(`SoundManager: play ${event}`);
    } catch (err) {
      logger.warn(`SoundManager: play error for ${event}`, { err });
    }
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    logger.info(`SoundManager: setEnabled ${v}`);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.sounds.forEach(howl => howl.volume(this.volume));
    logger.info(`SoundManager: setVolume ${this.volume}`);
  }
}

export const soundManager = new SoundManager();
