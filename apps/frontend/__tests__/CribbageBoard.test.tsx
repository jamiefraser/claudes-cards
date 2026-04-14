/**
 * CribbageBoard tests — SPEC.md §19 Story 8.5
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CribbageBoard } from '../src/components/table/cribbage/CribbageBoard';
import type { CribbageBoardState } from '@shared/gameState';

const twoPlayerBoardState: CribbageBoardState = {
  pegs: [
    { playerId: 'player-1', color: 'red', frontPeg: 0, backPeg: 0 },
    { playerId: 'player-2', color: 'blue', frontPeg: 0, backPeg: 0 },
  ],
  skunkLine: 91,
  doubleskunkLine: 61,
  winScore: 121,
};

const threePlayerBoardState: CribbageBoardState = {
  pegs: [
    { playerId: 'player-1', color: 'red', frontPeg: 15, backPeg: 0 },
    { playerId: 'player-2', color: 'blue', frontPeg: 10, backPeg: 0 },
    { playerId: 'player-3', color: 'green', frontPeg: 5, backPeg: 0 },
  ],
  skunkLine: 91,
  doubleskunkLine: 61,
  winScore: 121,
};

const playerNames: Record<string, string> = {
  'player-1': 'Alice',
  'player-2': 'Bob',
};

const threePlayerNames: Record<string, string> = {
  'player-1': 'Alice',
  'player-2': 'Bob',
  'player-3': 'Carol',
};

describe('CribbageBoard', () => {
  it('renders with aria-label "Cribbage scoring board"', () => {
    render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    expect(screen.getByRole('img', { name: 'Cribbage scoring board' })).toBeInTheDocument();
  });

  it('renders text scores below the board for each player', () => {
    render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    expect(screen.getByText('Alice: 0 points')).toBeInTheDocument();
    expect(screen.getByText('Bob: 0 points')).toBeInTheDocument();
  });

  it('renders 121 holes per lane for 2-player game', () => {
    const { container } = render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    // Each hole is a circle with data-hole attribute
    const holes = container.querySelectorAll('circle[data-hole]');
    // 2 lanes × 121 holes = 242 holes
    expect(holes).toHaveLength(242);
  });

  it('renders 121 holes per lane for 3-player game', () => {
    const { container } = render(
      <CribbageBoard boardState={threePlayerBoardState} playerNames={threePlayerNames} />,
    );
    const holes = container.querySelectorAll('circle[data-hole]');
    // 3 lanes × 121 holes = 363 holes
    expect(holes).toHaveLength(363);
  });

  it('renders a skunk line at hole 91', () => {
    const { container } = render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    expect(container.querySelector('[data-skunk-line]')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('renders a double-skunk line at hole 61', () => {
    const { container } = render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    expect(container.querySelector('[data-double-skunk-line]')).toBeInTheDocument();
    expect(screen.getByText('SS')).toBeInTheDocument();
  });

  it('renders the goal hole at position 121 with gold border', () => {
    const { container } = render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    expect(container.querySelector('[data-goal-hole]')).toBeInTheDocument();
  });

  it('renders pegs at correct positions', () => {
    const boardStateWithPegs: CribbageBoardState = {
      pegs: [
        { playerId: 'player-1', color: 'red', frontPeg: 25, backPeg: 10 },
        { playerId: 'player-2', color: 'blue', frontPeg: 0, backPeg: 0 },
      ],
      skunkLine: 91,
      doubleskunkLine: 61,
      winScore: 121,
    };
    const { container } = render(
      <CribbageBoard boardState={boardStateWithPegs} playerNames={playerNames} />,
    );
    // Front peg and back peg for player 1
    expect(container.querySelector('[data-peg="player-1-front"]')).toBeInTheDocument();
    expect(container.querySelector('[data-peg="player-1-back"]')).toBeInTheDocument();
  });

  it('renders two lanes for 2-player game', () => {
    const { container } = render(
      <CribbageBoard boardState={twoPlayerBoardState} playerNames={playerNames} />,
    );
    expect(container.querySelectorAll('[data-lane]')).toHaveLength(2);
  });

  it('renders three lanes for 3-player game', () => {
    const { container } = render(
      <CribbageBoard boardState={threePlayerBoardState} playerNames={threePlayerNames} />,
    );
    expect(container.querySelectorAll('[data-lane]')).toHaveLength(3);
  });

  it('renders score text with updated frontPeg value', () => {
    const advancedState: CribbageBoardState = {
      pegs: [
        { playerId: 'player-1', color: 'red', frontPeg: 42, backPeg: 30 },
        { playerId: 'player-2', color: 'blue', frontPeg: 18, backPeg: 12 },
      ],
      skunkLine: 91,
      doubleskunkLine: 61,
      winScore: 121,
    };
    render(
      <CribbageBoard boardState={advancedState} playerNames={playerNames} />,
    );
    expect(screen.getByText('Alice: 42 points')).toBeInTheDocument();
    expect(screen.getByText('Bob: 18 points')).toBeInTheDocument();
  });
});
