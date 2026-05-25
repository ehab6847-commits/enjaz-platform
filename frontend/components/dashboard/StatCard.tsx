'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'accent' | 'success' | 'warning' | 'error' | 'info';
  trend?: {
    value: number;
    label: string;
    direction: 'up' | 'down' | 'neutral';
  };
  loading?: boolean;
  className?: string;
  suffix?: string;
}

const colorMap = {
  accent: {
    icon: 'bg-accent/10 border-accent/20 text-accent-light',
    glow: 'shadow-[0_0_20px_rgba(99,102,241,0.1)]',
    accent: 'from-accent to-purple-500',
  },
  success: {
    icon: 'bg-success/10 border-success/20 text-success',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.1)]',
    accent: 'from-success to-emerald-400',
  },
  warning: {
    icon: 'bg-warning/10 border-warning/20 text-warning',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.1)]',
    accent: 'from-warning to-yellow-400',
  },
  error: {
    icon: 'bg-error/10 border-error/20 text-error',
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.1)]',
    accent: 'from-error to-red-400',
  },
  info: {
    icon: 'bg-info/10 border-info/20 text-info',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.1)]',
    accent: 'from-info to-blue-400',
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = 'accent',
  trend,
  loading = false,
  className,
  suffix,
}: StatCardProps) {
  const colors = colorMap[color];

  if (loading) {
    return (
      <div className={cn('stat-card animate-pulse', className)}>
        <div className="flex items-start justify-between mb-4">
          <div className="skeleton w-10 h-10 rounded-xl" />
          <div className="skeleton w-16 h-5 rounded-full" />
        </div>
        <div className="skeleton h-8 w-24 rounded-lg mb-2" />
        <div className="skeleton h-4 w-32 rounded" />
      </div>
    );
  }

  return (
    <div className={cn('stat-card group', colors.glow, className)}>
      {/* Background gradient accent */}
      <div
        className={cn(
          'absolute -top-px left-0 right-0 h-0.5 bg-gradient-to-l opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          colors.accent
        )}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div
          className={cn(
            'w-12 h-12 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
            colors.icon
          )}
        >
          {icon}
        </div>

        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
              trend.direction === 'up' && 'bg-success/10 text-success border border-success/20',
              trend.direction === 'down' && 'bg-error/10 text-error border border-error/20',
              trend.direction === 'neutral' && 'bg-surface-2 text-text-muted border border-border'
            )}
          >
            {trend.direction === 'up' && <TrendingUp size={12} />}
            {trend.direction === 'down' && <TrendingDown size={12} />}
            {trend.direction === 'neutral' && <Minus size={12} />}
            {trend.value > 0 ? '+' : ''}{trend.value}%
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mb-2">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-text tabular-nums">
            {typeof value === 'number' ? value.toLocaleString('ar-SA') : value}
          </span>
          {suffix && <span className="text-sm text-text-subtle">{suffix}</span>}
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-text-muted">{title}</p>

      {/* Trend label */}
      {trend && (
        <p className="text-xs text-text-subtle mt-1">{trend.label}</p>
      )}

      {/* Subtitle */}
      {subtitle && (
        <p className="text-xs text-text-subtle mt-1">{subtitle}</p>
      )}
    </div>
  );
}

export default StatCard;
