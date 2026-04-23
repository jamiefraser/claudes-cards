import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { OpponentMeldsPanel } from './OpponentMeldsPanel';

describe('<OpponentMeldsPanel />', () => {
  it('renders children without rotation when orientation is top', () => {
    render(
      <OpponentMeldsPanel orientation="top">
        <div data-testid="melds">Melds</div>
      </OpponentMeldsPanel>,
    );
    const panel = screen.getByTestId('opponent-melds-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId('melds')).toBeInTheDocument();
    expect(panel.style.transform).toBe('');
    expect(panel).toHaveAttribute('data-orientation', 'top');
  });

  it('applies 90deg rotation for left orientation', () => {
    render(
      <OpponentMeldsPanel orientation="left">
        <div>Melds</div>
      </OpponentMeldsPanel>,
    );
    const panel = screen.getByTestId('opponent-melds-panel');
    expect(panel.style.transform).toBe('rotate(90deg)');
  });

  it('applies -90deg rotation for right orientation', () => {
    render(
      <OpponentMeldsPanel orientation="right">
        <div>Melds</div>
      </OpponentMeldsPanel>,
    );
    const panel = screen.getByTestId('opponent-melds-panel');
    expect(panel.style.transform).toBe('rotate(-90deg)');
  });
});
