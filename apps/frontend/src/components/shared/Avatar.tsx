/**
 * Avatar component — shows a player's avatar image or a generated initials fallback.
 */
import React from 'react';

interface AvatarProps {
  displayName: string;
  avatarUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ displayName, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const base = `inline-flex items-center justify-center rounded-full overflow-hidden select-none ${sizeClass} ${className}`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <span
      aria-label={displayName}
      className={`${base} bg-indigo-600 text-white font-semibold`}
    >
      {getInitials(displayName)}
    </span>
  );
}
