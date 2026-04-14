/**
 * FriendRequestsPanel — shows pending friend requests with Accept/Reject buttons.
 * SPEC.md §17 Epic 6
 */
import React, { useCallback } from 'react';
import { useLobbyStore } from '@/store/lobbyStore';
import { acceptFriendRequest, declineFriendRequest } from '@/api/friends.api';
import { Avatar } from '@/components/shared/Avatar';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import en from '@/i18n/en.json';

export function FriendRequestsPanel() {
  const pendingRequests = useLobbyStore(s => s.pendingRequests);
  const setFriends = useLobbyStore(s => s.setFriends);
  const friends = useLobbyStore(s => s.friends);
  const { toast } = useToast();

  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set());

  const handleAccept = useCallback(
    async (requestId: string) => {
      setProcessingIds(prev => new Set(prev).add(requestId));
      try {
        const newFriend = await acceptFriendRequest(requestId);
        setFriends([...friends, newFriend]);
        // Remove from pending list
        useLobbyStore.setState(s => ({
          pendingRequests: s.pendingRequests.filter(r => r.id !== requestId),
        }));
        logger.info('FriendRequestsPanel: accepted request', { requestId });
        toast(en.social.requestSent, 'success');
      } catch (err) {
        logger.error('FriendRequestsPanel: accept failed', { err });
        toast(en.app.error, 'error');
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [friends, setFriends, toast],
  );

  const handleDecline = useCallback(
    async (requestId: string) => {
      setProcessingIds(prev => new Set(prev).add(requestId));
      try {
        await declineFriendRequest(requestId);
        useLobbyStore.setState(s => ({
          pendingRequests: s.pendingRequests.filter(r => r.id !== requestId),
        }));
        logger.info('FriendRequestsPanel: declined request', { requestId });
      } catch (err) {
        logger.error('FriendRequestsPanel: decline failed', { err });
        toast(en.app.error, 'error');
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [toast],
  );

  if (pendingRequests.length === 0) return null;

  return (
    <section aria-label={en.social.friendRequests} className="mb-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-3">
        {en.social.friendRequests}
      </h3>
      <ul className="space-y-1">
        {pendingRequests.map(req => {
          const isProcessing = processingIds.has(req.id);
          return (
            <li
              key={req.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-700/30"
            >
              <Avatar
                displayName={req.fromDisplayName}
                avatarUrl={req.fromAvatarUrl}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{req.fromDisplayName}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleAccept(req.id)}
                  disabled={isProcessing}
                  aria-label={`${en.social.accept} ${req.fromDisplayName}`}
                  className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-2 py-1 rounded transition-colors"
                >
                  {en.social.accept}
                </button>
                <button
                  onClick={() => handleDecline(req.id)}
                  disabled={isProcessing}
                  aria-label={`${en.social.decline} ${req.fromDisplayName}`}
                  className="text-xs bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-2 py-1 rounded transition-colors"
                >
                  {en.social.decline}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
