import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RulesPanel, type RulesSection } from './RulesPanel';

const sections: RulesSection[] = [
  { id: 'obj',  title: 'Object',  body: 'Win by scoring points.' },
  { id: 'deal', title: 'Deal',    body: 'Each player gets six cards.' },
  { id: 'play', title: 'Play',    body: 'Non-dealer leads.' },
];

describe('<RulesPanel />', () => {
  it('renders a collapsed tab when closed, not the drawer', () => {
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={false}
        onToggle={() => {}}
        sections={sections}
      />,
    );
    expect(screen.getByRole('button', { name: /open rules/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the drawer as an aria dialog when open', () => {
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={true}
        onToggle={() => {}}
        sections={sections}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: /cribbage/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/object/i)).toBeInTheDocument();
  });

  it('fires onToggle when the tab is clicked', async () => {
    const onToggle = vi.fn();
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={false}
        onToggle={onToggle}
        sections={sections}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /open rules/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('fires onToggle when the close chevron is clicked', async () => {
    const onToggle = vi.fn();
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={true}
        onToggle={onToggle}
        sections={sections}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /close rules/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('closes on Escape when open', async () => {
    const onToggle = vi.fn();
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={true}
        onToggle={onToggle}
        sections={sections}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('ignores Escape when closed', async () => {
    const onToggle = vi.fn();
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={false}
        onToggle={onToggle}
        sections={sections}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('opens only one accordion section at a time', async () => {
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={true}
        onToggle={() => {}}
        sections={sections}
      />,
    );
    const objectHeader = screen.getByRole('button', { name: /object/i });
    const dealHeader = screen.getByRole('button', { name: /^deal/i });

    await userEvent.click(objectHeader);
    expect(objectHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/win by scoring points/i)).toBeInTheDocument();

    await userEvent.click(dealHeader);
    expect(dealHeader).toHaveAttribute('aria-expanded', 'true');
    expect(objectHeader).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the empty-state when given no sections', () => {
    render(
      <RulesPanel
        title="Spit"
        isOpen={true}
        onToggle={() => {}}
        sections={[]}
      />,
    );
    expect(screen.getByText(/not yet available/i)).toBeInTheDocument();
  });

  it('renders a subtitle when provided', () => {
    render(
      <RulesPanel
        title="Cribbage"
        subtitle="Two-player · 121 points"
        isOpen={true}
        onToggle={() => {}}
        sections={sections}
      />,
    );
    expect(screen.getByText(/121 points/i)).toBeInTheDocument();
  });

  it('renders the attribution footer when provided', () => {
    render(
      <RulesPanel
        title="Cribbage"
        isOpen={true}
        onToggle={() => {}}
        sections={sections}
        attribution="Hoyle's Games Modernized (1909), public domain."
      />,
    );
    expect(screen.getByText(/hoyle/i)).toBeInTheDocument();
  });
});
