import React, { useEffect, useRef, useState } from 'react';
import { GameSettingsPanel } from './GameSettingsPanel';
import en from '@/i18n/en.json';

export interface SettingsPopoverProps {
  readonly onLeave?: () => void;
  /**
   * When provided, renders a destructive "End game" button next to settings.
   * Intended for the host when every other seat is a bot — it tears down the
   * room via DELETE /api/v1/rooms/:id.
   */
  readonly onEndGame?: () => void;
}

export function SettingsPopover({ onLeave, onEndGame }: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pillBase = [
    'w-10 h-10 rounded-full flex items-center justify-center',
    'bg-night-raised/70 backdrop-blur',
    'border border-brass/20 text-brass-bright/80',
    'hover:text-brass-bright hover:border-brass/50 hover:bg-night-raised',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
    'transition-colors',
  ].join(' ');

  const endPillBase = [
    'w-10 h-10 rounded-full flex items-center justify-center',
    'bg-rose-600/80 text-white',
    'border border-rose-400/40',
    'hover:bg-rose-500 hover:border-rose-300/60',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400',
    'transition-colors',
  ].join(' ');

  return (
    <div ref={ref} className="relative inline-flex items-center gap-2">
      {onEndGame && (
        <button
          type="button"
          onClick={onEndGame}
          aria-label="End and delete this game"
          title="End and delete this game"
          className={endPillBase}
        >
          <span aria-hidden className="text-lg leading-none">⏻</span>
        </button>
      )}
      {onLeave && (
        <button
          type="button"
          onClick={onLeave}
          aria-label={en.table.leaveRoom}
          className={pillBase}
        >
          <span aria-hidden className="text-lg leading-none">⎋</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? en.table.settingsClose : en.table.settingsOpen}
        aria-expanded={open}
        className={pillBase}
      >
        <span aria-hidden className="text-lg leading-none">⚙</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={en.settings?.title ?? 'Settings'}
          className={[
            'absolute right-0 top-12 w-72 z-40',
            'bg-night-raised/95 backdrop-blur',
            'border border-brass/25 rounded-2xl shadow-float',
            'p-1 animate-[seat-in_220ms_ease-out_both]',
          ].join(' ')}
        >
          <GameSettingsPanel />
        </div>
      )}
    </div>
  );
}
