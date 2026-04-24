import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { TableSurface } from './TableSurface';

describe('<TableSurface />', () => {
  it('renders the stage slot in the middle of a 3-column grid', () => {
    render(
      <TableSurface stage={<div data-testid="felt">Felt</div>} />,
    );
    const surface = screen.getByTestId('table-surface');
    expect(surface).toBeInTheDocument();
    expect(surface).toHaveClass('relative');
    expect(surface).toHaveClass('grid');
    // Side columns reserve enough space for a rotated badge+melds stack
    // (~220px visible post-rotation). Regression guard for the 3+ player
    // viewport-edge-clipping bug.
    expect(surface.className).toMatch(/grid-cols-\[minmax\(220px,260px\)/);
    expect(screen.getByTestId('felt')).toBeInTheDocument();
  });

  it('renders left and right slots alongside the stage', () => {
    render(
      <TableSurface
        leftSlot={<div data-testid="left">L</div>}
        stage={<div data-testid="stage">S</div>}
        rightSlot={<div data-testid="right">R</div>}
      />,
    );
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('stage')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('renders empty left / right slot wrappers even when no content is passed', () => {
    // Empty slots must still exist so the grid columns reserve viewport
    // space and the felt stays centred at every player count.
    render(
      <TableSurface stage={<div data-testid="stage">S</div>} />,
    );
    expect(screen.getByTestId('table-surface').querySelector('[data-slot="opp-left"]')).not.toBeNull();
    expect(screen.getByTestId('table-surface').querySelector('[data-slot="opp-right"]')).not.toBeNull();
  });

  it('has overflow: visible so animations anchored just outside the felt are not clipped', () => {
    render(
      <TableSurface stage={<div>Content</div>} />,
    );
    const surface = screen.getByTestId('table-surface');
    expect(surface.style.overflow).toBe('visible');
  });
});
