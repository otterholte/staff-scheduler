'use client';

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  variant?: 'solid' | 'outline' | 'subtle';
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

export function Badge({
  children,
  color = '#3b82f6',
  variant = 'subtle',
  size = 'md',
  removable = false,
  onRemove,
  className = '',
}: BadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  const getStyles = () => {
    switch (variant) {
      case 'solid':
        return {
          backgroundColor: color,
          color: 'white',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          border: `1px solid ${color}`,
          color: color,
        };
      case 'subtle':
      default:
        return {
          backgroundColor: `${color}20`,
          color: color,
        };
    }
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${sizes[size]}
        ${className}
      `}
      style={getStyles()}
    >
      {children}
      {removable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

interface BadgeGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function BadgeGroup({ children, className = '' }: BadgeGroupProps) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {children}
    </div>
  );
}

