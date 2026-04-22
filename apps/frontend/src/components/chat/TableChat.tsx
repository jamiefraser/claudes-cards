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
  const [openMobile, setOpenMobile] = useState(false);
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

  // Collapsed by default below `lg`: chat shouldn't compete with the hand
  // for the bottom of a phone screen. Tap the tab to open as a sheet.
  const unread = displayMessages.length;

  return (
    <>
      {/* Mobile / tablet: floating tab + bottom-sheet. */}
      <button
        type="button"
        onClick={() => setOpenMobile(v => !v)}
        aria-expanded={openMobile}
        aria-controls="table-chat-sheet"
        className={[
          'lg:hidden fixed bottom-3 right-3 z-dock',
          'min-h-[44px] min-w-[44px] px-3 py-2 rounded-full',
          'bg-paper-raised border border-hairline/80 shadow-paper text-ink',
          'inline-flex items-center gap-2 text-xs font-medium tracking-wide',
          'hover:border-ochre focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi',
        ].join(' ')}
      >
        <span aria-hidden>✎</span>
        <span>{openMobile ? 'Hide chat' : 'Chat'}</span>
        {!openMobile && unread > 0 && (
          <span className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded-full bg-ochre/15 text-ochre">
            {unread}
          </span>
        )}
      </button>

      {openMobile && (
        <div
          id="table-chat-sheet"
          className="lg:hidden fixed inset-x-0 bottom-0 z-dock max-h-[55vh] bg-paper-raised border-t border-hairline/70 shadow-paper flex flex-col animate-seat-in"
          aria-label="Chat"
        >
          <div
            className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0"
            aria-live="polite"
            aria-relevant="additions"
          >
            {displayMessages.length === 0 && (
              <p className="text-xs text-whisper text-center mt-4">{en.chat.noMessages}</p>
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

          <div className="p-3 border-t border-hairline/70 flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={en.chat.placeholder}
              maxLength={500}
              aria-label={en.chat.placeholder}
              className="flex-1 bg-paper border border-hairline text-ink rounded-md px-3 py-2 min-h-[44px] text-sm outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              aria-label={en.chat.send}
              className="min-h-[44px] px-4 rounded-md bg-ochre text-accent-fg disabled:opacity-40 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised"
            >
              {en.chat.send}
            </button>
          </div>
        </div>
      )}

      {/* Desktop: always-on right rail. */}
      <aside
        className="hidden lg:flex flex-col bg-paper-raised border-l border-hairline/70 w-72 h-full"
        aria-label="Chat"
      >
        <div
          className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0"
          aria-live="polite"
          aria-relevant="additions"
        >
          {displayMessages.length === 0 && (
            <p className="text-xs text-whisper text-center mt-4">{en.chat.noMessages}</p>
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

        <div className="p-3 border-t border-hairline/70 flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={en.chat.placeholder}
            maxLength={500}
            aria-label={en.chat.placeholder}
            className="flex-1 bg-paper border border-hairline text-ink rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            aria-label={en.chat.send}
            className="min-h-[40px] px-4 rounded-md bg-ochre text-accent-fg disabled:opacity-40 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised"
          >
            {en.chat.send}
          </button>
        </div>
      </aside>
    </>
  );
}
