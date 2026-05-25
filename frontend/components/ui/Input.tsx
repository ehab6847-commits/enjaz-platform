'use client';

import React, { InputHTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      hint,
      icon,
      iconEnd,
      fullWidth = true,
      type,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label className="text-sm font-medium text-text-muted block">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none z-10">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={resolvedType}
            className={cn(
              'h-11 w-full rounded-xl transition-all duration-200',
              'bg-surface-2 border border-border',
              'text-text text-sm font-cairo',
              'placeholder:text-text-subtle',
              'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-surface',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              icon ? 'pr-10 pl-4' : 'px-4',
              (iconEnd || isPassword) ? 'pl-10' : '',
              error && 'border-error focus:border-error focus:ring-error/20',
              className
            )}
            dir="rtl"
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors z-10"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
          {!isPassword && iconEnd && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none z-10">
              {iconEnd}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        {hint && !error && <p className="text-xs text-text-subtle">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
