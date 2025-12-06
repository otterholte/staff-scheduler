'use client';

import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}: ToggleProps) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          className="sr-only"
          disabled={disabled}
        />
        <div
          className={`
            w-11 h-6 rounded-full transition-colors duration-200
            ${checked ? 'bg-gradient-to-r from-blue-500 to-purple-500' : 'bg-white/20'}
          `}
        >
          <div
            className={`
              absolute top-0.5 left-0.5 w-5 h-5 rounded-full
              bg-white shadow-lg
              transition-transform duration-200
              ${checked ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </div>
      </div>
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <span className="text-sm font-medium text-white">{label}</span>
          )}
          {description && (
            <p className="text-sm text-white/60 mt-0.5">{description}</p>
          )}
        </div>
      )}
    </label>
  );
}

