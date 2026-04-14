/**
 * MessageBubble — renders a single chat or system message.
 * Supports emoji reactions (👍 ❤️ 😂 🎉), reply, and report actions.
 * System messages (type='system') are rendered with distinct italic grey styling.
 * SPEC.md §16 Epic 5
 */
import React, { useState } from 'react';
import type { ChatMessage } from '@shared/chat';
import en from '@/i18n/en.json';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉'] as const;
type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

interface MessageBubbleProps {
  message: ChatMessage;
  currentPlayerId: string;
  onReact?: (messageId: string, emoji: string) => void;
  onReport?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function MessageBubble({
  message,
  currentPlayerId,
  onReact,
  onReport,
  onReply,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  const isSystem = message.type === 'system';
  const isOwnMessage = message.senderId === currentPlayerId;

  // System messages: centred, italicised, grey
  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs italic text-slate-400 px-3 py-1 rounded-full bg-slate-700/50">
          {message.content}
        </span>
      </div>
    );
  }

  const reactions = message.reactions ?? {};
  const totalReactions = Object.values(reactions).reduce((sum, ids) => sum + ids.length, 0);

  return (
    <div
      className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} mb-2`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Sender name (only for others) */}
      {!isOwnMessage && (
        <span className="text-xs text-slate-400 mb-0.5 ml-1">{message.senderDisplayName}</span>
      )}

      <div className="relative flex items-end gap-1">
        {/* Action buttons (shown on hover, left side for own messages) */}
        {showActions && isOwnMessage && (
          <div className="flex items-center gap-1 mr-1">
            {onReport && (
              <button
                onClick={() => onReport(message.id)}
                aria-label={en.chat.report}
                className="text-xs text-slate-500 hover:text-slate-300 px-1 py-0.5 rounded bg-slate-700"
              >
                {en.chat.report}
              </button>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`max-w-[240px] rounded-2xl px-3 py-2 text-sm ${
            isOwnMessage
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-slate-700 text-slate-100 rounded-tl-sm'
          }`}
        >
          <p>{message.content}</p>
          <time
            dateTime={message.sentAt}
            className={`text-[10px] mt-0.5 block ${isOwnMessage ? 'text-indigo-300' : 'text-slate-400'}`}
          >
            {formatTime(message.sentAt)}
          </time>
        </div>

        {/* Action buttons (shown on hover, right side for others) */}
        {showActions && !isOwnMessage && (
          <div className="flex items-center gap-1 ml-1">
            {onReply && (
              <button
                onClick={() => onReply(message.id)}
                aria-label={en.chat.reply}
                className="text-xs text-slate-500 hover:text-slate-300 px-1 py-0.5 rounded bg-slate-700"
              >
                {en.chat.reply}
              </button>
            )}
            {onReport && (
              <button
                onClick={() => onReport(message.id)}
                aria-label={en.chat.report}
                className="text-xs text-slate-500 hover:text-slate-300 px-1 py-0.5 rounded bg-slate-700"
              >
                {en.chat.report}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Emoji reaction picker (shown on hover) */}
      {showActions && onReact && (
        <div className={`flex gap-1 mt-0.5 ${isOwnMessage ? 'mr-0' : 'ml-1'}`}>
          {REACTION_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => onReact(message.id, emoji)}
              aria-label={emoji}
              className="text-sm hover:scale-125 transition-transform rounded p-0.5 hover:bg-slate-600"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Existing reactions display */}
      {totalReactions > 0 && (
        <div className={`flex gap-1 mt-0.5 flex-wrap ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
          {(Object.entries(reactions) as [string, string[]][]).map(([emoji, playerIds]) =>
            playerIds.length > 0 ? (
              <span
                key={emoji}
                className="inline-flex items-center gap-0.5 text-xs bg-slate-700 rounded-full px-1.5 py-0.5"
              >
                {emoji}
                <span className="text-slate-400">{playerIds.length}</span>
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
