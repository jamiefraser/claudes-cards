/**
 * FriendEntry — single friend in the friend list.
 * Updated in Unit 12 to include: Invite to room, Remove friend, Block buttons.
 * SPEC.md §17 Epic 6
 */
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/shared/Avatar';
import { StatusDot } from '@/components/shared/StatusDot';
import { useLobbyStore } from '@/store/lobbyStore';
import { removeFriend, blockPlayer } from '@/api/friends.api';
import { getLobbySocket } from '@/hooks/useSocket';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import type { FriendEntry as FriendEntryType } from '@shared/friends';
import en from '@/i18n/en.json';

interface FriendEntryProps {
  friend: FriendEntryType;
  /** If provided, show Invite to Room button for this roomId. */
  currentRoomId?: string;
}

export function FriendEntry({ friend, currentRoomId }: FriendEntryProps) {
  const navigate = useNavigate();
  const openDM = useLobbyStore(s => s.openDM);
  const friends = useLobbyStore(s => s.friends);
  const setFriends = useLobbyStore(s => s.setFriends);
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const statusLabel: Record<string, string> = {
    online:    en.social.online,
    'in-game': en.social.inGame,
    away:      en.social.away,
    offline:   en.social.offline,
  };

  const handleJoinGame = useCallback(() => {
    if (friend.currentRoomId) {
      navigate(`/table/${friend.currentRoomId}`);
    }
  }, [friend.currentRoomId, navigate]);

  const handleInviteToRoom = useCallback(() => {
    if (!currentRoomId) return;
    const socket = getLobbySocket();
    logger.debug('FriendEntry: emitting room_invite', { roomId: currentRoomId, toPlayerId: friend.playerId });
    socket.emit('room_invite', { roomId: currentRoomId, toPlayerId: friend.playerId });
    toast(en.social.inviteSent.replace('{name}', friend.displayName), 'success');
  }, [currentRoomId, friend.playerId, friend.displayName, toast]);

  const handleRemoveFriend = useCallback(async () => {
    setIsProcessing(true);
    try {
      await removeFriend(friend.playerId);
      setFriends(friends.filter(f => f.playerId !== friend.playerId));
      logger.info('FriendEntry: removed friend', { playerId: friend.playerId });
    } catch (err) {
      logger.error('FriendEntry: remove friend failed', { err });
      toast(en.app.error, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [friend.playerId, friend.displayName, friends, setFriends, toast]);

  const handleBlock = useCallback(async () => {
    setIsProcessing(true);
    try {
      await blockPlayer(friend.playerId);
      setFriends(friends.filter(f => f.playerId !== friend.playerId));
      logger.info('FriendEntry: blocked player', { playerId: friend.playerId });
      toast(en.social.blocked.replace('{name}', friend.displayName), 'info');
    } catch (err) {
      logger.error('FriendEntry: block failed', { err });
      toast(en.app.error, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [friend.playerId, friend.displayName, friends, setFriends, toast]);

  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-700/50 transition-colors">
      <div className="relative flex-shrink-0">
        <Avatar displayName={friend.displayName} avatarUrl={friend.avatarUrl} size="sm" />
        <StatusDot
          status={friend.status}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-slate-800"
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{friend.displayName}</p>
        <p className="text-xs text-slate-400">
          {statusLabel[friend.status] ?? friend.status}
          {friend.status === 'in-game' && friend.currentRoomId && (
            <button
              onClick={handleJoinGame}
              className="ml-1 text-indigo-400 hover:text-indigo-300 underline"
              aria-label={`${en.social.spectate} ${friend.displayName}`}
            >
              {en.social.spectate}
            </button>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {/* Invite to room (shown when in a room) */}
        {currentRoomId && friend.status !== 'in-game' && (
          <button
            onClick={handleInviteToRoom}
            aria-label={`${en.social.inviteToRoom} ${friend.displayName}`}
            title={en.social.inviteToRoom}
            className="text-slate-400 hover:text-indigo-400 p-1 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {/* Message */}
        <button
          onClick={() => openDM(friend.playerId)}
          aria-label={`${en.social.message} ${friend.displayName}`}
          title={en.social.message}
          className="text-slate-400 hover:text-white p-1 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>

        {/* Remove friend */}
        <button
          onClick={handleRemoveFriend}
          disabled={isProcessing}
          aria-label={`${en.social.removeFriend} ${friend.displayName}`}
          title={en.social.removeFriend}
          className="text-slate-400 hover:text-red-400 disabled:opacity-40 p-1 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
        </button>

        {/* Block */}
        <button
          onClick={handleBlock}
          disabled={isProcessing}
          aria-label={`${en.social.blockUser} ${friend.displayName}`}
          title={en.social.blockUser}
          className="text-slate-400 hover:text-red-600 disabled:opacity-40 p-1 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
      </div>
    </li>
  );
}
