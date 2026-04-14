/**
 * StatusDot — coloured dot indicating player online status.
 * SPEC.md §6 / §17 (Friends & Social)
 */
import React from 'react';
import type { OnlineStatus } from '@shared/friends';

const STATUS_COLORS: Record<OnlineStatus, string> = {
  online:   'bg-green-500',
  'in-game': 'bg-amber-500',
  away:     'bg-slate-400',
  offline:  'bg-slate-600',
};

interface StatusDotProps {
  status: OnlineStatus;
  className?: string;
}

export function StatusDot({ status, className = '' }: StatusDotProps) {
  const color = STATUS_COLORS[status] ?? 'bg-slate-600';
  return (
    <span
      role="img"
      aria-label={status}
      className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${className}`}
    />
  );
}
