'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = `
    inline-flex items-center justify-center gap-2 font-medium
    rounded-xl transition-all duration-200 ease-out
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
    disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-[0.98]
  `;

  const variants = {
    primary: `
      bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500
      hover:from-blue-600 hover:via-purple-600 hover:to-pink-600
      text-white shadow-lg shadow-purple-500/25
      focus-visible:ring-purple-500
    `,
    secondary: `
      glass border border-white/20
      hover:bg-white/10 hover:border-white/30
      text-white
      focus-visible:ring-white/50
    `,
    ghost: `
      bg-transparent hover:bg-white/10
      text-white/80 hover:text-white
      focus-visible:ring-white/50
    `,
    danger: `
      bg-gradient-to-r from-red-500 to-rose-500
      hover:from-red-600 hover:to-rose-600
      text-white shadow-lg shadow-red-500/25
      focus-visible:ring-red-500
    `,
    success: `
      bg-gradient-to-r from-emerald-500 to-green-500
      hover:from-emerald-600 hover:to-green-600
      text-white shadow-lg shadow-emerald-500/25
      focus-visible:ring-emerald-500
    `,
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

