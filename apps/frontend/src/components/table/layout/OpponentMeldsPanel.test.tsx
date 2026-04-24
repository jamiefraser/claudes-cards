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
    // No inner rotator for the top orientation.
    expect(screen.queryByTestId('opponent-melds-panel-rotator')).toBeNull();
  });

  it('applies -90deg rotation on the inner rotator for left orientation', () => {
    render(
      <OpponentMeldsPanel orientation="left">
        <div>Melds</div>
      </OpponentMeldsPanel>,
    );
    const rotator = screen.getByTestId('opponent-melds-panel-rotator');
    expect(rotator.style.transform).toBe('rotate(-90deg)');
    // Outer reserves the post-rotation footprint (220 × 260 visible).
    const panel = screen.getByTestId('opponent-melds-panel');
    expect(panel.style.width).toBe('220px');
    expect(panel.style.height).toBe('260px');
  });

  it('applies 90deg rotation on the inner rotator for right orientation', () => {
    render(
      <OpponentMeldsPanel orientation="right">
        <div>Melds</div>
      </OpponentMeldsPanel>,
    );
    const rotator = screen.getByTestId('opponent-melds-panel-rotator');
    expect(rotator.style.transform).toBe('rotate(90deg)');
    const panel = screen.getByTestId('opponent-melds-panel');
    expect(panel.style.width).toBe('220px');
    expect(panel.style.height).toBe('260px');
  });
});
