/**
 * FriendSuggestions — shows 5 suggested players to add as friends.
 * For now fetches the first 5 results from /players/search.
 * SPEC.md §17 Epic 6
 */
import React, { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { sendFriendRequest } from '@/api/friends.api';
import { Avatar } from '@/components/shared/Avatar';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import en from '@/i18n/en.json';

interface PlayerSuggestion {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

async function fetchSuggestions(): Promise<PlayerSuggestion[]> {
  const results = await apiFetch<PlayerSuggestion[]>('/players/search?q=&limit=5');
  return results.slice(0, 5);
}

export function FriendSuggestions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['friend-suggestions'],
    queryFn: fetchSuggestions,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (toPlayerId: string) => sendFriendRequest(toPlayerId),
    onSuccess: () => {
      toast(en.social.requestSent, 'success');
      void queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] });
    },
    onError: (err) => {
      logger.error('FriendSuggestions: sendFriendRequest failed', { err });
      toast(en.app.error, 'error');
    },
  });

  if (isLoading || suggestions.length === 0) return null;

  return (
    <section aria-label={en.social.suggestions} className="mb-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-3">
        {en.social.suggestions}
      </h3>
      <ul className="space-y-1">
        {suggestions.map(player => (
          <li
            key={player.id}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-700/50 transition-colors"
          >
            <Avatar displayName={player.displayName} avatarUrl={player.avatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{player.displayName}</p>
            </div>
            <button
              onClick={() => mutation.mutate(player.id)}
              disabled={mutation.isPending}
              aria-label={`${en.social.addFriend} ${player.displayName}`}
              className="text-xs bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white px-2 py-1 rounded transition-colors"
            >
              {en.social.addFriend}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
