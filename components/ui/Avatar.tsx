'use client';

import React from 'react';

interface AvatarProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({
  name,
  color = '#3b82f6',
  size = 'md',
  className = '',
}: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  return (
    <div
      className={`
        ${sizes[size]}
        rounded-full flex items-center justify-center
        font-semibold text-white
        shadow-lg
        ${className}
      `}
      style={{
        backgroundColor: color,
        boxShadow: `0 4px 14px ${color}40`,
      }}
    >
      {initials}
    </div>
  );
}

interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarGroup({
  children,
  max = 5,
  size = 'md',
  className = '',
}: AvatarGroupProps) {
  const childArray = React.Children.toArray(children);
  const visibleChildren = childArray.slice(0, max);
  const remainingCount = childArray.length - max;

  const overlapSizes = {
    sm: '-ml-2',
    md: '-ml-3',
    lg: '-ml-4',
  };

  const countSizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  return (
    <div className={`flex items-center ${className}`}>
      {visibleChildren.map((child, index) => (
        <div
          key={index}
          className={`${index > 0 ? overlapSizes[size] : ''} ring-2 ring-slate-900 rounded-full`}
        >
          {child}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={`
            ${overlapSizes[size]} ${countSizes[size]}
            rounded-full flex items-center justify-center
            bg-slate-700 text-white font-medium
            ring-2 ring-slate-900
          `}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

