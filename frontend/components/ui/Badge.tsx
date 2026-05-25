'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'new' | 'seen' | 'assigned' | 'archived' | 'urgent' | 'normal' | 'low' | 'custom';
  className?: string;
  dot?: boolean;
}

const variantMap: Record<string, string> = {
  new: 'badge-new',
  seen: 'badge-seen',
  assigned: 'badge-assigned',
  archived: 'badge-archived',
  urgent: 'badge-urgent',
  normal: 'badge-normal',
  low: 'badge-low',
};

export function Badge({ children, variant = 'new', className, dot = false }: BadgeProps) {
  return (
    <span className={cn('badge', variant !== 'custom' && variantMap[variant], className)}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 flex-shrink-0" />
      )}
      {children}
    </span>
  );
}

// ─── Service Badge ─────────────────────────────────────────────
interface ServiceBadgeProps {
  type: string;
  label: string;
  className?: string;
}

const SERVICE_COLORS: Record<string, string> = {
  programming: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  research: 'bg-purple-500/15 text-purple-300 border border-purple-500/25',
  presentations: 'bg-pink-500/15 text-pink-300 border border-pink-500/25',
  translation: 'bg-green-500/15 text-green-300 border border-green-500/25',
  design: 'bg-orange-500/15 text-orange-300 border border-orange-500/25',
  writing: 'bg-teal-500/15 text-teal-300 border border-teal-500/25',
  consulting: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25',
  data_analysis: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  video: 'bg-red-500/15 text-red-300 border border-red-500/25',
  other: 'bg-gray-500/15 text-gray-300 border border-gray-500/25',
};

export function ServiceBadge({ type, label, className }: ServiceBadgeProps) {
  const color = SERVICE_COLORS[type] ?? SERVICE_COLORS.other;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
        color,
        className
      )}
    >
      {label}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────
interface StatusBadgeProps {
  status: 'new' | 'seen' | 'assigned' | 'archived';
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  seen: 'مُشاهَد',
  assigned: 'مُعيَّن',
  archived: 'أرشيف',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={status} dot className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// ─── Priority Badge ────────────────────────────────────────────
interface PriorityBadgeProps {
  priority: 'urgent' | 'normal' | 'low';
  className?: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; icon: string }> = {
  urgent: { label: 'عاجل', icon: '🔴' },
  normal: { label: 'عادي', icon: '🟡' },
  low: { label: 'منخفض', icon: '🟢' },
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <Badge variant={priority as 'urgent' | 'normal' | 'low'} className={className}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </Badge>
  );
}

export default Badge;
