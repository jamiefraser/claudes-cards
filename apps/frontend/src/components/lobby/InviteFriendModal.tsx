/**
 * InviteFriendModal — select friends and send room invite.
 * Uses POST /friends + socket.emit('room_invite').
 * SPEC.md §17 Epic 6
 */
import React, { useState, useCallback } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Avatar } from '@/components/shared/Avatar';
import { useLobbyStore } from '@/store/lobbyStore';
import { getLobbySocket } from '@/hooks/useSocket';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import en from '@/i18n/en.json';

interface InviteFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

export function InviteFriendModal({ isOpen, onClose, roomId }: InviteFriendModalProps) {
  const friends = useLobbyStore(s => s.friends);
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  const toggleFriend = useCallback((playerId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }, []);

  const handleSendInvites = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsSending(true);

    const socket = getLobbySocket();
    try {
      for (const playerId of selectedIds) {
        logger.debug('InviteFriendModal: emitting room_invite', { roomId, playerId });
        socket.emit('room_invite', { roomId, toPlayerId: playerId });
      }
      toast(en.social.invitesSent.replace('{count}', String(selectedIds.size)), 'success');
      setSelectedIds(new Set());
      onClose();
    } catch (err) {
      logger.error('InviteFriendModal: failed to send invites', { err });
      toast(en.app.error, 'error');
    } finally {
      setIsSending(false);
    }
  }, [selectedIds, roomId, toast, onClose]);

  // Only show online/away friends (no point inviting offline friends)
  const invitableFriends = friends.filter(f => f.status !== 'in-game');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={en.social.inviteToRoom}>
      <div className="space-y-3">
        {invitableFriends.length === 0 ? (
          <p className="text-sm text-slate-400">{en.social.noFriends}</p>
        ) : (
          <ul className="space-y-1 max-h-60 overflow-y-auto">
            {invitableFriends.map(friend => (
              <li key={friend.playerId}>
                <label className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-slate-700/50 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(friend.playerId)}
                    onChange={() => toggleFriend(friend.playerId)}
                    className="rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <Avatar
                    displayName={friend.displayName}
                    avatarUrl={friend.avatarUrl}
                    size="sm"
                  />
                  <span className="text-sm text-white">{friend.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded transition-colors"
          >
            {en.rooms.cancel}
          </button>
          <button
            onClick={handleSendInvites}
            disabled={selectedIds.size === 0 || isSending}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors"
          >
            {en.social.inviteToRoom}
          </button>
        </div>
      </div>
    </Modal>
  );
}
