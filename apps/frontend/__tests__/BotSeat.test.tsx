/**
 * BotSeat tests — SPEC.md §9.6, §15
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BotSeat } from '../src/components/table/BotSeat';
import type { PlayerState } from '@shared/gameState';

const mockPlayerState: PlayerState = {
  playerId: 'player-2',
  displayName: 'TestPlayer2',
  hand: [],
  score: 0,
  isOut: false,
  isBot: true,
};

describe('BotSeat', () => {
  it('shows the original display name with (Bot) suffix', () => {
    render(
      <BotSeat
        playerState={mockPlayerState}
        originalDisplayName="TestPlayer2"
        isCurrentTurn={false}
      />,
    );
    expect(screen.getByText('TestPlayer2 (Bot)')).toBeInTheDocument();
  });

  it('shows the BOT badge', () => {
    render(
      <BotSeat
        playerState={mockPlayerState}
        originalDisplayName="TestPlayer2"
        isCurrentTurn={false}
      />,
    );
    expect(screen.getByText('BOT')).toBeInTheDocument();
  });

  it('shows a tooltip on the BOT badge', () => {
    render(
      <BotSeat
        playerState={mockPlayerState}
        originalDisplayName="TestPlayer2"
        isCurrentTurn={false}
      />,
    );
    const badge = screen.getByText('BOT');
    expect(badge).toHaveAttribute('title', 'Bot is playing for TestPlayer2 — they may return');
  });

  it('shows thinking indicator when it is current turn', () => {
    render(
      <BotSeat
        playerState={mockPlayerState}
        originalDisplayName="TestPlayer2"
        isCurrentTurn={true}
      />,
    );
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('does not show thinking indicator when not current turn', () => {
    render(
      <BotSeat
        playerState={mockPlayerState}
        originalDisplayName="TestPlayer2"
        isCurrentTurn={false}
      />,
    );
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  });

  it('renders a robot icon (SVG)', () => {
    const { container } = render(
      <BotSeat
        playerState={mockPlayerState}
        originalDisplayName="TestPlayer2"
        isCurrentTurn={false}
      />,
    );
    expect(container.querySelector('svg[data-bot-avatar="true"]')).toBeInTheDocument();
  });
});
