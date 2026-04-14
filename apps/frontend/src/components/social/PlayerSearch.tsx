/**
 * PlayerSearch — search for players to send friend requests.
 */
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { sendFriendRequest } from '@/api/friends.api';
import { useToast } from '@/components/shared/Toast';
import { Avatar } from '@/components/shared/Avatar';
import type { PlayerProfile } from '@shared/auth';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';

interface SearchResult {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export function PlayerSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      logger.debug('PlayerSearch: searching', { query });
      const data = await apiFetch<SearchResult[]>(`/players/search?q=${encodeURIComponent(query)}`);
      setResults(data);
    } catch (err) {
      logger.warn('PlayerSearch: search error', { err });
      toast(en.app.error, 'error');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = useMutation({
    mutationFn: (playerId: string) => sendFriendRequest(playerId),
    onSuccess: () => toast(en.social.requestSent, 'success'),
    onError: () => toast(en.app.error, 'error'),
  });

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={en.social.searchPlayers}
          className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
          aria-label={en.social.searchPlayers}
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
        >
          {searching ? en.lobby.searching : en.social.search}
        </button>
      </form>

      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map(player => (
            <li
              key={player.id}
              className="flex items-center gap-3 px-3 py-2 bg-slate-700 rounded-md"
            >
              <Avatar displayName={player.displayName} avatarUrl={player.avatarUrl} size="sm" />
              <span className="flex-1 text-sm text-white">{player.displayName}</span>
              <button
                onClick={() => sendRequest.mutate(player.id)}
                disabled={sendRequest.isPending}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md disabled:opacity-50"
                aria-label={`${en.social.sendRequest} to ${player.displayName}`}
              >
                {en.social.addFriend}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
