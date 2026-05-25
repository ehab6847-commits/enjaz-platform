'use client';

import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: [
    'text-white font-semibold',
    'bg-gradient-to-l from-accent to-accent-dark',
    'shadow-[0_4px_15px_rgba(99,102,241,0.35)]',
    'hover:from-accent-light hover:to-accent',
    'hover:shadow-[0_8px_25px_rgba(99,102,241,0.5)]',
    'active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
  ].join(' '),

  secondary: [
    'text-accent-light font-semibold',
    'bg-accent-muted',
    'border border-accent/30',
    'hover:bg-accent/20 hover:border-accent',
    'hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]',
    'active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed',
  ].join(' '),

  ghost: [
    'text-text-muted',
    'bg-transparent',
    'hover:bg-white/5 hover:text-text',
    'active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed',
  ].join(' '),

  danger: [
    'text-red-300 font-medium',
    'bg-red-500/10',
    'border border-red-500/30',
    'hover:bg-red-500/20 hover:border-red-500',
    'active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed',
  ].join(' '),

  success: [
    'text-white font-semibold',
    'bg-gradient-to-l from-emerald-500 to-emerald-600',
    'shadow-[0_4px_15px_rgba(16,185,129,0.3)]',
    'hover:from-emerald-400 hover:to-emerald-500',
    'active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed',
  ].join(' '),

  outline: [
    'text-text font-medium',
    'bg-transparent',
    'border border-border',
    'hover:border-accent/50 hover:text-accent-light hover:bg-accent/5',
    'active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed',
  ].join(' '),
};

const sizeClasses: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs rounded-lg gap-1',
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-11 px-5 text-base rounded-xl gap-2',
  xl: 'h-13 px-7 text-base rounded-2xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'start',
      fullWidth = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center transition-all duration-200 select-none cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          iconPosition === 'start' && icon && <span className="flex-shrink-0">{icon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && iconPosition === 'end' && icon && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
