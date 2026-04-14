/**
 * MuteUserPanel — search player, apply mute, show active mutes with Unmute.
 * SPEC.md §22 Story 11.3
 */
import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminUser, applyMute, removeMute } from '@/api/admin.api';
import { apiFetch } from '@/api/client';
import { Avatar } from '@/components/shared/Avatar';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import type { AdminPlayerProfile, MuteDuration } from '@shared/admin';
import en from '@/i18n/en.json';

const MUTE_DURATIONS: { value: MuteDuration; label: string }[] = [
  { value: '15min',     label: en.admin.mute15min },
  { value: '1hr',       label: en.admin.mute1hr },
  { value: '24hr',      label: en.admin.mute24hr },
  { value: '7day',      label: en.admin.mute7day },
  { value: 'permanent', label: en.admin.mutePermanent },
];

interface PlayerSearchResult {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export function MuteUserPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [duration, setDuration] = useState<MuteDuration>('1hr');
  const [reason, setReason] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const { data: playerProfile } = useQuery<AdminPlayerProfile>({
    queryKey: ['admin', 'user', selectedPlayerId],
    queryFn: () => getAdminUser(selectedPlayerId!),
    enabled: !!selectedPlayerId,
  });

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await apiFetch<PlayerSearchResult[]>(
        `/players/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
      );
      setSearchResults(results);
    } catch (err) {
      logger.error('MuteUserPanel: search failed', { err });
      toast(en.app.error, 'error');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, toast]);

  const muteMutation = useMutation({
    mutationFn: () =>
      applyMute({ playerId: selectedPlayerId!, duration, reason }),
    onSuccess: () => {
      toast(en.admin.applyMute, 'success');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', selectedPlayerId] });
    },
    onError: (err) => {
      logger.error('MuteUserPanel: applyMute failed', { err });
      toast(en.app.error, 'error');
    },
  });

  const unmuteMutation = useMutation({
    mutationFn: (playerId: string) => removeMute(playerId),
    onSuccess: () => {
      toast(en.admin.unmute, 'success');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', selectedPlayerId] });
    },
    onError: (err) => {
      logger.error('MuteUserPanel: removeMute failed', { err });
      toast(en.app.error, 'error');
    },
  });

  function formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) return en.admin.permanent;
    try {
      return new Date(expiresAt).toLocaleString();
    } catch {
      return expiresAt;
    }
  }

  return (
    <div className="space-y-6">
      {/* Player search */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">{en.admin.mutePlayer}</h2>
        <div className="flex gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSearch(); }}
            placeholder={en.admin.searchPlayers}
            aria-label={en.admin.searchPlayers}
            className="flex-1 bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {en.social.search}
          </button>
        </div>

        {searchResults.length > 0 && (
          <ul className="mt-2 bg-slate-800 rounded-lg border border-slate-600 divide-y divide-slate-700 max-h-48 overflow-y-auto">
            {searchResults.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => { setSelectedPlayerId(p.id); setSearchResults([]); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700/50 transition-colors"
                >
                  <Avatar displayName={p.displayName} avatarUrl={p.avatarUrl} size="sm" />
                  <span className="text-sm text-white">{p.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mute form */}
      {selectedPlayerId && playerProfile && (
        <section className="bg-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              displayName={playerProfile.displayName}
              avatarUrl={playerProfile.avatarUrl}
              size="md"
            />
            <div>
              <p className="text-sm font-semibold text-white">{playerProfile.displayName}</p>
              <p className="text-xs text-slate-400">@{playerProfile.username}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {en.admin.duration}
            </label>
            <select
              value={duration}
              onChange={e => setDuration(e.target.value as MuteDuration)}
              aria-label={en.admin.duration}
              className="bg-slate-700 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MUTE_DURATIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {en.admin.reason}
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={en.admin.reasonPlaceholder}
              aria-label={en.admin.reason}
              rows={3}
              className="w-full bg-slate-700 text-white placeholder-slate-500 border border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <button
            onClick={() => muteMutation.mutate()}
            disabled={muteMutation.isPending || !reason.trim()}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {en.admin.applyMute}
          </button>

          {/* Active mutes */}
          {playerProfile.activeMutes.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-400 mb-2">{en.admin.activeMutes}</h3>
              <ul className="space-y-2">
                {playerProfile.activeMutes.map(mute => (
                  <li
                    key={mute.id}
                    className="flex items-start justify-between bg-slate-700/50 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-white">{mute.reason}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {en.admin.expires}: {formatExpiry(mute.expiresAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => unmuteMutation.mutate(mute.playerId)}
                      disabled={unmuteMutation.isPending}
                      className="text-xs bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-2 py-1 rounded transition-colors ml-2"
                    >
                      {en.admin.unmute}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {playerProfile.activeMutes.length === 0 && (
            <p className="text-xs text-slate-500">{en.admin.noActiveMutes}</p>
          )}
        </section>
      )}
    </div>
  );
}
