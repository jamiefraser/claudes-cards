/**
 * useSound — React hook wrapping the SoundManager singleton.
 * SPEC.md §10.2
 */
import { useCallback } from 'react';
import { soundManager } from '@/sound/SoundManager';
import { useGameStore } from '@/store/gameStore';
import type { SoundEvent } from '@shared/sound';

/**
 * Returns a play function that respects the soundEnabled setting from gameStore.
 */
export function useSound() {
  const soundEnabled = useGameStore(s => s.soundEnabled);

  const play = useCallback(
    (event: SoundEvent) => {
      if (soundEnabled) {
        soundManager.play(event);
      }
    },
    [soundEnabled],
  );

  return { play };
}
