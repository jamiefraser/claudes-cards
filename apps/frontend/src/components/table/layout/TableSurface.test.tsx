import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { TableSurface } from './TableSurface';

describe('<TableSurface />', () => {
  it('renders children in a relative positioned container', () => {
    render(
      <TableSurface>
        <div data-testid="felt">Felt</div>
      </TableSurface>,
    );
    const surface = screen.getByTestId('table-surface');
    expect(surface).toHaveClass('relative');
    expect(screen.getByTestId('felt')).toBeInTheDocument();
  });

  it('has overflow: visible to avoid clipping tucked meld panels', () => {
    render(
      <TableSurface>
        <div>Content</div>
      </TableSurface>,
    );
    const surface = screen.getByTestId('table-surface');
    expect(surface.style.overflow).toBe('visible');
  });
});
