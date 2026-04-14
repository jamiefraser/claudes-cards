/**
 * TableChat — in-game chat panel, right sidebar of GameTable.
 * Shows last 100 messages from chat_history on join.
 * Emits chat_message socket event.
 * Respects mute state (client-side hides muted users).
 * System messages (bot_activated, bot_yielded) are styled differently via MessageBubble.
 * SPEC.md §16 Epic 5
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getGameSocket } from '@/hooks/useSocket';
import { useAuth } from '@/auth/useAuth';
import { MessageBubble } from './MessageBubble';
import { logger } from '@/utils/logger';
import type { ChatMessage } from '@shared/chat';
import en from '@/i18n/en.json';

interface TableChatProps {
  /** Set of player IDs that the current user has muted. */
  mutedPlayerIds?: Set<string>;
  /** Room ID — used to filter messages and emit events. */
  roomId: string;
}

export function TableChat({ mutedPlayerIds = new Set(), roomId }: TableChatProps) {
  const { player } = useAuth();
  const chatMessages = useGameStore(s => s.chatMessages);
  const addChatMessage = useGameStore(s => s.addChatMessage);
  const [inputValue, setInputValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const socket = getGameSocket();

  // Subscribe to incoming chat_message events
  useEffect(() => {
    function onChatMessage(msg: ChatMessage) {
      logger.debug('TableChat: received chat_message', { msgId: msg.id });
      addChatMessage(msg);
    }

    socket.on('chat_message', onChatMessage);
    return () => {
      socket.off('chat_message', onChatMessage);
    };
  }, [socket, addChatMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content || !player) return;

    logger.debug('TableChat: emitting chat_message', { roomId, content });
    socket.emit('chat_message', { roomId, content });
    setInputValue('');
  }, [inputValue, player, roomId, socket]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      logger.debug('TableChat: emitting chat_react', { messageId, emoji });
      socket.emit('chat_react', { roomId, messageId, emoji });
    },
    [roomId, socket],
  );

  const handleReport = useCallback(
    (messageId: string) => {
      logger.debug('TableChat: emitting chat_report', { messageId });
      socket.emit('chat_report', { roomId, messageId });
    },
    [roomId, socket],
  );

  // Filter out muted players (defense-in-depth; server also enforces)
  const visibleMessages = chatMessages.filter(
    msg => msg.type === 'system' || !mutedPlayerIds.has(msg.senderId),
  );

  // Only show last 100 messages
  const displayMessages = visibleMessages.slice(-100);

  return (
    <aside
      className="flex flex-col bg-slate-800 border-t lg:border-t-0 lg:border-l border-slate-700 w-full lg:w-72 lg:h-full max-h-60 lg:max-h-none"
      aria-label="Chat"
    >
      {/* Message list */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0"
        aria-live="polite"
        aria-relevant="additions"
      >
        {displayMessages.length === 0 && (
          <p className="text-xs text-slate-500 text-center mt-4">{en.chat.noMessages}</p>
        )}
        {displayMessages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            currentPlayerId={player?.id ?? ''}
            onReact={handleReact}
            onReport={msg.type !== 'system' ? handleReport : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={en.chat.placeholder}
            maxLength={500}
            aria-label={en.chat.placeholder}
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
    </aside>
  );
}
