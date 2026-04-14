/**
 * GameSettingsPanel — sound toggle, animation speed, colorblind mode.
 * SPEC.md §15
 */
import React from 'react';
import { useGameStore } from '@/store/gameStore';
import en from '@/i18n/en.json';

export function GameSettingsPanel() {
  const soundEnabled = useGameStore(s => s.soundEnabled);
  const animationSpeed = useGameStore(s => s.animationSpeed);
  const colorBlindMode = useGameStore(s => s.colorBlindMode);
  const setSoundEnabled = useGameStore(s => s.setSoundEnabled);
  const setAnimationSpeed = useGameStore(s => s.setAnimationSpeed);
  const setColorBlindMode = useGameStore(s => s.setColorBlindMode);

  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700 text-sm">
      <h3 className="text-white font-semibold">{en.settings.title}</h3>

      {/* Sound toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={e => setSoundEnabled(e.target.checked)}
          className="w-4 h-4 rounded accent-indigo-500"
          aria-label={en.settings.soundEnabled}
        />
        <span className="text-slate-200">{en.settings.soundEnabled}</span>
      </label>

      {/* Animation speed */}
      <div className="flex flex-col gap-1">
        <label className="text-slate-400">{en.settings.animationSpeed}</label>
        <select
          value={animationSpeed}
          onChange={e =>
            setAnimationSpeed(e.target.value as 'fast' | 'normal' | 'slow')
          }
          className="bg-slate-700 text-white rounded px-2 py-1 border border-slate-600"
          aria-label={en.settings.animationSpeed}
        >
          <option value="fast">{en.settings.fast}</option>
          <option value="normal">{en.settings.normal}</option>
          <option value="slow">{en.settings.slow}</option>
        </select>
      </div>

      {/* Colorblind mode */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={colorBlindMode}
          onChange={e => setColorBlindMode(e.target.checked)}
          className="w-4 h-4 rounded accent-indigo-500"
          aria-label={en.settings.colorBlind}
        />
        <span className="text-slate-200">{en.settings.colorBlind}</span>
      </label>
    </div>
  );
}
