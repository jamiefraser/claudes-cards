/**
 * CreateRoomModal — form to create a new game room.
 * SPEC.md §14 Story 3.x
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/shared/Modal';
import { useToast } from '@/components/shared/Toast';
import { createRoom } from '@/api/rooms.api';
import type { GameCatalogEntry } from '@shared/admin';
import type { CreateRoomPayload, RoomSettings } from '@shared/rooms';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: GameCatalogEntry;
  onRoomCreated?: (roomId: string) => void;
}

const TIMER_OPTIONS: { label: string; value: number }[] = [
  { label: en.rooms.timer24h, value: 86400 },
  { label: en.rooms.timer48h, value: 172800 },
  { label: en.rooms.timer72h, value: 259200 },
];

export function CreateRoomModal({ isOpen, onClose, game, onRoomCreated }: CreateRoomModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [asyncMode, setAsyncMode] = useState(false);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number>(86400);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(game.maxPlayers);

  const mutation = useMutation({
    mutationFn: async () => {
      const settings: RoomSettings = {
        maxPlayers,
        asyncMode,
        turnTimerSeconds: asyncMode ? turnTimerSeconds : null,
        isPrivate,
        password: isPrivate ? password : null,
      };
      const payload: CreateRoomPayload = {
        gameId: game.id,
        name: name.trim() || undefined,
        settings,
      };
      logger.debug('CreateRoomModal: creating room', payload);
      return createRoom(payload);
    },
    onSuccess: (room) => {
      toast(en.rooms.create, 'success');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onRoomCreated?.(room.id);
      onClose();
      // Host navigates directly into the waiting room for their new table.
      navigate(`/table/${room.id}`);
    },
    onError: (err) => {
      logger.warn('CreateRoomModal: create failed', { err });
      toast(en.app.error, 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const playerOptions = Array.from(
    { length: game.maxPlayers - game.minPlayers + 1 },
    (_, i) => game.minPlayers + i,
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${en.rooms.createTitle}: ${game.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Room name */}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">{en.rooms.roomName}</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={en.rooms.roomNamePlaceholder}
            maxLength={60}
            className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
            aria-label={en.rooms.roomName}
          />
        </label>

        {/* Max players */}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">{en.rooms.maxPlayers}</span>
          <select
            value={maxPlayers}
            onChange={e => setMaxPlayers(Number(e.target.value))}
            className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
            aria-label={en.rooms.maxPlayers}
          >
            {playerOptions.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        {/* Async mode */}
        {game.supportsAsync && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={asyncMode}
                onChange={e => setAsyncMode(e.target.checked)}
              />
              {en.rooms.asyncToggle}
            </label>
            {asyncMode && (
              <label className="flex flex-col gap-1 ml-6">
                <span className="text-xs text-slate-400">{en.rooms.turnTimer}</span>
                <select
                  value={turnTimerSeconds}
                  onChange={e => setTurnTimerSeconds(Number(e.target.value))}
                  className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm"
                  aria-label={en.rooms.turnTimer}
                >
                  {TIMER_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {/* Private room */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
            />
            {en.rooms.privateToggle}
          </label>
          {isPrivate && (
            <label className="flex flex-col gap-1 ml-6">
              <span className="text-xs text-slate-400">{en.rooms.password}</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={en.rooms.passwordPlaceholder}
                className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-1.5 text-sm"
                aria-label={en.rooms.password}
              />
            </label>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 min-h-[44px] text-sm text-slate-300 hover:text-white transition-colors"
          >
            {en.rooms.cancel}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-3 min-h-[44px] text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? en.app.loading : en.rooms.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}
