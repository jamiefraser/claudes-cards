/**
 * DMDrawer — right-side drawer in lobby for direct messages.
 * Shows all DM threads from lobbyStore.dmInbox.
 * Click thread to open conversation.
 * Emits dm_send socket event.
 * Plays notification.mp3 on DM receipt.
 * SPEC.md §16 Epic 5
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLobbyStore } from '@/store/lobbyStore';
import { getLobbySocket } from '@/hooks/useSocket';
import { useAuth } from '@/auth/useAuth';
import { soundManager } from '@/sound/SoundManager';
import { logger } from '@/utils/logger';
import type { ChatMessage } from '@shared/chat';
import type { DMInboxEntry } from '@shared/friends';
import en from '@/i18n/en.json';

interface DMThread {
  playerId: string;
  displayName: string;
  messages: ChatMessage[];
}

interface DMDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DMDrawer({ isOpen, onClose }: DMDrawerProps) {
  const { player } = useAuth();
  const dmInbox = useLobbyStore(s => s.dmInbox);
  const incrementNotifications = useLobbyStore(s => s.incrementNotifications);

  const [activeThread, setActiveThread] = useState<DMThread | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const socket = getLobbySocket();

  // Subscribe to incoming dm events
  useEffect(() => {
    function onDMReceived(msg: ChatMessage) {
      logger.debug('DMDrawer: received dm', { msgId: msg.id, senderId: msg.senderId });

      // Play notification sound
      soundManager.play('notification');

      // Increment notification count if drawer is not open on this thread
      if (!activeThread || activeThread.playerId !== msg.senderId) {
        incrementNotifications();
      }

      // If active thread matches sender, append to thread messages
      if (activeThread && activeThread.playerId === msg.senderId) {
        setThreadMessages(prev => [...prev, msg]);
      }
    }

    socket.on('dm_received', onDMReceived);
    return () => {
      socket.off('dm_received', onDMReceived);
    };
  }, [socket, activeThread, incrementNotifications]);

  // Scroll to bottom when thread messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  const openThread = useCallback((entry: DMInboxEntry) => {
    setActiveThread({
      playerId: entry.fromPlayerId,
      displayName: entry.fromDisplayName,
      messages: [],
    });
    setThreadMessages([]);
    setInputValue('');
    // TODO: fetch existing messages via GET /api/v1/messages/dm/:playerId
  }, []);

  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content || !activeThread || !player) return;

    const msg: Partial<ChatMessage> = {
      content,
    };

    logger.debug('DMDrawer: emitting dm_send', { toPlayerId: activeThread.playerId });
    socket.emit('dm_send', { toPlayerId: activeThread.playerId, content });

    // Optimistically add to thread
    const optimisticMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      roomId: 'dm',
      senderId: player.id,
      senderDisplayName: player.displayName,
      content,
      type: 'dm',
      sentAt: new Date().toISOString(),
    };
    setThreadMessages(prev => [...prev, optimisticMsg]);
    setInputValue('');
  }, [inputValue, activeThread, player, socket]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-80 bg-slate-800 border-l border-slate-700 z-[150] flex flex-col shadow-xl"
      aria-label={en.chat.dmTitle}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-white">
          {activeThread ? activeThread.displayName : en.chat.dmTitle}
        </h2>
        <div className="flex gap-2">
          {activeThread && (
            <button
              onClick={() => setActiveThread(null)}
              aria-label="Back to inbox"
              className="text-slate-400 hover:text-white text-sm"
            >
              &larr;
            </button>
          )}
          <button
            onClick={onClose}
            aria-label={en.aria.closeDialog}
            className="text-slate-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>
      </div>

      {activeThread ? (
        // Thread view
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {threadMessages.length === 0 && (
              <p className="text-xs text-slate-500 text-center mt-4">{en.chat.noMessages}</p>
            )}
            {threadMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.senderId === player?.id ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[220px] rounded-2xl px-3 py-2 text-sm ${
                    msg.senderId === player?.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-100'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-slate-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={en.chat.dmPlaceholder}
                maxLength={500}
                aria-label={en.chat.dmPlaceholder}
                className="flex-1 bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                aria-label={en.chat.send}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                {en.chat.send}
              </button>
            </div>
          </div>
        </>
      ) : (
        // Inbox view
        <div className="flex-1 overflow-y-auto">
          {dmInbox.length === 0 ? (
            <p className="text-xs text-slate-500 text-center mt-8 px-4">{en.chat.noMessages}</p>
          ) : (
            <ul className="divide-y divide-slate-700">
              {dmInbox.map(entry => (
                <li key={entry.fromPlayerId}>
                  <button
                    onClick={() => openThread(entry)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white truncate">
                          {entry.fromDisplayName}
                        </span>
                        {entry.unreadCount > 0 && (
                          <span className="ml-2 bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 flex-shrink-0">
                            {entry.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{entry.lastMessage}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
