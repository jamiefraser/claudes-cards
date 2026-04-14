/**
 * FriendList — sidebar showing friends and pending requests.
 * Subscribes to lobby socket for real-time presence updates.
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FriendEntry } from './FriendEntry';
import { PlayerSearch } from './PlayerSearch';
import { Modal } from '@/components/shared/Modal';
import { useToast } from '@/components/shared/Toast';
import { getFriends, sendFriendRequest } from '@/api/friends.api';
import { apiFetch } from '@/api/client';
import { useLobbyStore } from '@/store/lobbyStore';
import { getLobbySocket } from '@/hooks/useSocket';
import type { FriendStatusPayload, FriendRequestPayload } from '@shared/socket';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';

export function FriendList() {
  const [showSearch, setShowSearch] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { friends, setFriends, updateFriendStatus, addPendingRequest, pendingRequests } = useLobbyStore();

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addUsername.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      // Look up the player by username to get their ID
      const results = await apiFetch<Array<{ id: string; username: string }>>(
        `/players/search?q=${encodeURIComponent(trimmed)}`,
      ).catch(() => []);
      const target = results.find((r) => r.username === trimmed) ?? results[0];
      if (!target) {
        toast(en.app.error, 'error');
        return;
      }
      await sendFriendRequest(target.id);
      toast(en.social.requestSent, 'success');
      setAddModalOpen(false);
      setAddUsername('');
    } catch (err) {
      logger.warn('FriendList: sendFriendRequest failed', { err });
      toast(en.app.error, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch friends on mount
  const { isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      logger.debug('FriendList: fetching friends');
      const data = await getFriends();
      setFriends(data);
      return data;
    },
    staleTime: 30_000,
  });

  // Subscribe to real-time friend status updates
  useEffect(() => {
    const socket = getLobbySocket();

    const onFriendStatus = (payload: FriendStatusPayload) => {
      logger.debug('FriendList: friend_status', payload);
      updateFriendStatus(payload.playerId, payload.status);
    };

    const onFriendRequest = (payload: FriendRequestPayload) => {
      logger.debug('FriendList: friend_request', { fromId: payload.request.fromPlayerId });
      addPendingRequest(payload.request);
    };

    socket.on('friend_status', onFriendStatus);
    socket.on('friend_request', onFriendRequest);

    return () => {
      socket.off('friend_status', onFriendStatus);
      socket.off('friend_request', onFriendRequest);
    };
  }, [updateFriendStatus, addPendingRequest]);

  const onlineFriends = friends.filter(f => f.status !== 'offline');
  const offlineFriends = friends.filter(f => f.status === 'offline');

  return (
    <aside className="w-full md:w-60 md:flex-shrink-0 bg-slate-800 rounded-lg p-4 flex flex-col gap-4" aria-label={en.social.friends}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          {en.social.friends}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setAddModalOpen(true)}
            aria-label={en.social.addFriend}
            className="text-xs text-indigo-400 hover:text-indigo-300 min-h-[44px] px-2 inline-flex items-center"
          >
            {en.social.addFriend}
          </button>
          <button
            onClick={() => setShowSearch(s => !s)}
            aria-label={en.social.search}
            className="text-xs text-slate-400 hover:text-slate-300 min-h-[44px] px-2 inline-flex items-center"
          >
            {en.social.search}
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="border-b border-slate-700 pb-3">
          <PlayerSearch />
        </div>
      )}

      {/* Add Friend modal — SPEC.md §17 Epic 6 */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={en.social.addFriend}
      >
        <form onSubmit={handleSendRequest} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">{en.social.username}</span>
            <input
              type="text"
              value={addUsername}
              onChange={e => setAddUsername(e.target.value)}
              placeholder="test-player-2"
              className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
              aria-label={en.social.username}
              autoFocus
            />
          </label>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-3 min-h-[44px] text-sm text-slate-300 hover:text-white"
            >
              {en.rooms.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || !addUsername.trim()}
              className="px-4 py-3 min-h-[44px] text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50"
            >
              {submitting ? en.app.loading : en.social.sendRequest}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-1">{en.social.pendingRequests} ({pendingRequests.length})</p>
          {pendingRequests.map(req => (
            <div key={req.id} className="flex items-center gap-2 text-sm text-slate-300 py-1">
              <span className="flex-1 truncate">{req.fromDisplayName}</span>
              <button className="text-xs text-green-400 hover:text-green-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded min-h-[44px] px-3 inline-flex items-center">{en.social.accept}</button>
              <button className="text-xs text-red-400 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded min-h-[44px] px-3 inline-flex items-center">{en.social.decline}</button>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <p className="text-slate-400 text-sm" role="status" aria-label={en.social.loadingFriends}>
          <span aria-hidden="true">…</span>
        </p>
      )}

      {!isLoading && friends.length === 0 && (
        <p className="text-slate-400 text-sm">{en.social.noFriends}</p>
      )}

      {/* Online friends */}
      {onlineFriends.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{en.social.onlineFriends} ({onlineFriends.length})</p>
          <ul>
            {onlineFriends.map(f => <FriendEntry key={f.playerId} friend={f} />)}
          </ul>
        </div>
      )}

      {/* Offline friends */}
      {offlineFriends.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{en.social.offline} ({offlineFriends.length})</p>
          <ul>
            {offlineFriends.map(f => <FriendEntry key={f.playerId} friend={f} />)}
          </ul>
        </div>
      )}
    </aside>
  );
}
