import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { StockDiscardArea } from './StockDiscardArea';

describe('<StockDiscardArea />', () => {
  it('renders children in a centered horizontal row', () => {
    render(
      <StockDiscardArea>
        <div data-testid="draw">Draw</div>
        <div data-testid="discard">Discard</div>
      </StockDiscardArea>,
    );
    const area = screen.getByTestId('stock-discard-area');
    expect(area).toHaveClass('flex');
    expect(area).toHaveClass('flex-row');
    expect(area).toHaveClass('justify-center');
    expect(screen.getByTestId('draw')).toBeInTheDocument();
    expect(screen.getByTestId('discard')).toBeInTheDocument();
  });
});
