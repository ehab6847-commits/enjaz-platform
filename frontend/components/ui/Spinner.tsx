'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
  fullScreen?: boolean;
}

const sizeMap = {
  sm: 16,
  md: 24,
  lg: 36,
  xl: 48,
};

export function Spinner({ size = 'md', className, text, fullScreen }: SpinnerProps) {
  const spinnerEl = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <Loader2
        size={sizeMap[size]}
        className="animate-spin text-accent"
        strokeWidth={2}
      />
      {text && <p className="text-sm text-text-muted">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        {spinnerEl}
      </div>
    );
  }

  return spinnerEl;
}

// ─── Page Loading Skeleton ─────────────────────────────────────
export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-accent-light animate-spin"
            style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
        <p className="text-text-muted text-sm animate-pulse">جارٍ التحميل...</p>
      </div>
    </div>
  );
}

// ─── Skeleton Component ────────────────────────────────────────
interface SkeletonProps {
  className?: string;
  count?: number;
}

export function Skeleton({ className, count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('skeleton', className)} />
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton
                key={j}
                className={cn(
                  'h-4 rounded',
                  j === 0 ? 'w-32' : j === cols - 1 ? 'w-20' : 'flex-1'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Spinner;
