/**
 * ConnectionBanner tests — behavior tests for reconnection status display.
 * SPEC.md §20 Story 9.1–9.3
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ConnectionBanner } from '../src/components/shared/ConnectionBanner';
import { useGameStore } from '../src/store/gameStore';

beforeEach(() => {
  useGameStore.setState({ connectionStatus: 'connected' });
});

describe('ConnectionBanner', () => {
  it('renders nothing when connected', () => {
    useGameStore.setState({ connectionStatus: 'connected' });
    const { container } = render(<ConnectionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a yellow banner when reconnecting', () => {
    useGameStore.setState({ connectionStatus: 'reconnecting' });
    render(<ConnectionBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('bg-amber-500');
  });

  it('shows "Reconnecting…" text when reconnecting', () => {
    useGameStore.setState({ connectionStatus: 'reconnecting' });
    render(<ConnectionBanner />);
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
  });

  it('renders a red banner when disconnected', () => {
    useGameStore.setState({ connectionStatus: 'disconnected' });
    render(<ConnectionBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('bg-red-600');
  });

  it('shows "Connection lost" text when disconnected', () => {
    useGameStore.setState({ connectionStatus: 'disconnected' });
    render(<ConnectionBanner />);
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
  });

  it('banner is fixed-position', () => {
    useGameStore.setState({ connectionStatus: 'reconnecting' });
    render(<ConnectionBanner />);
    const banner = screen.getByRole('status');
    expect(banner.className).toContain('fixed');
  });
});
