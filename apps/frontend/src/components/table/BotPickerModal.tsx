/**
 * BotPickerModal — prompts the host to add bots before starting a game.
 * SPEC.md §9 (bot system).
 *
 * Rules:
 * - If the room has fewer than `maxPlayers` humans, prompt to add bots.
 * - If the host is the ONLY human, at least one bot MUST be selected.
 * - Empty seats not filled by bots are simply not used.
 */
import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/shared/Modal';

interface BotPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (botCount: number) => void;
  humanCount: number;
  minPlayers: number;
  maxPlayers: number;
}

export function BotPickerModal({
  isOpen,
  onClose,
  onConfirm,
  humanCount,
  minPlayers,
  maxPlayers,
}: BotPickerModalProps) {
  const emptySeats = Math.max(0, maxPlayers - humanCount);
  // If the host is alone, they MUST add at least one bot to start.
  const minBots = humanCount <= 1 ? 1 : 0;
  // Bots can fill at most the empty seats, but at least enough to satisfy minPlayers.
  const maxBots = emptySeats;
  const seatsBelowMin = Math.max(0, minPlayers - humanCount);
  const forcedMinBots = Math.max(minBots, seatsBelowMin);

  const [botCount, setBotCount] = useState<number>(forcedMinBots);

  useEffect(() => {
    // Reset choice whenever the modal re-opens with new constraints
    if (isOpen) {
      setBotCount(forcedMinBots);
    }
  }, [isOpen, forcedMinBots]);

  const options = [];
  for (let i = forcedMinBots; i <= maxBots; i++) {
    options.push(i);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add bots to start the game">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">
          Your room has {humanCount} human{humanCount === 1 ? '' : 's'} of {maxPlayers} seats.
          {forcedMinBots > 0 && (
            <>
              {' '}
              You must add at least <strong>{forcedMinBots}</strong>{' '}
              bot{forcedMinBots === 1 ? '' : 's'} to start.
            </>
          )}
          {forcedMinBots === 0 && emptySeats > 0 && (
            <>
              {' '}
              You may add up to <strong>{emptySeats}</strong> bot
              {emptySeats === 1 ? '' : 's'} to fill the remaining seats, or start without bots.
            </>
          )}
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">How many bots?</span>
          <select
            value={botCount}
            onChange={(e) => setBotCount(Number(e.target.value))}
            aria-label="Number of bots"
            className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'No bots — start with humans only' : `${n} bot${n === 1 ? '' : 's'}`}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3 justify-end mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(botCount)}
            disabled={botCount < forcedMinBots}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium disabled:opacity-50 transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    </Modal>
  );
}
