'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  glow?: boolean;
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  children,
  className,
  padding = 'md',
  hover = false,
  glow = false,
}: CardProps) {
  return (
    <div
      className={cn(
        'glass-card rounded-2xl',
        paddingMap[padding],
        hover && 'hover:border-accent/30 hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)] hover:-translate-y-0.5',
        glow && 'shadow-accent',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, icon, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent-light flex-shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-base font-bold text-text">{title}</h3>
          {subtitle && <p className="text-xs text-text-subtle mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        'mt-6 pt-4 border-t border-border flex items-center justify-between',
        className
      )}
    >
      {children}
    </div>
  );
}

export default Card;
