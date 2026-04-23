import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { GameScreen } from './GameScreen';

describe('<GameScreen />', () => {
  it('renders children inside a full-height container', () => {
    render(
      <GameScreen>
        <div data-testid="child">Hello</div>
      </GameScreen>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    const root = screen.getByTestId('game-screen');
    expect(root).toHaveClass('min-h-screen');
    expect(root).toHaveClass('bg-paper');
  });

  it('applies flex-col layout', () => {
    render(<GameScreen><span>content</span></GameScreen>);
    const root = screen.getByTestId('game-screen');
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('flex-col');
  });
});
