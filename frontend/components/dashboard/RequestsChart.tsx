'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardHeader } from '@/components/ui/Card';
import { BarChart3, PieChart as PieIcon, TrendingUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
interface BarData {
  name: string;
  value: number;
  color?: string;
}

interface PieData {
  name: string;
  value: number;
  color: string;
}

// ─── Custom Tooltip ───────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl p-3 text-sm shadow-xl"
      style={{
        background: '#1E293B',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        fontFamily: 'Cairo, sans-serif',
        direction: 'rtl',
      }}
    >
      {label && <p className="text-text-muted text-xs mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="font-bold" style={{ color: entry.color || '#6366F1' }}>
          {entry.value.toLocaleString('ar-SA')}
        </p>
      ))}
    </div>
  );
}

// ─── Requests By Service Bar Chart ────────────────────────────
interface RequestsChartProps {
  data?: BarData[];
  loading?: boolean;
}

const DEFAULT_BAR_DATA: BarData[] = [
  { name: 'برمجة', value: 45 },
  { name: 'بحث', value: 38 },
  { name: 'عروض', value: 29 },
  { name: 'ترجمة', value: 22 },
  { name: 'تصميم', value: 18 },
  { name: 'كتابة', value: 15 },
  { name: 'أخرى', value: 12 },
];

export function RequestsByServiceChart({ data = DEFAULT_BAR_DATA, loading }: RequestsChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="الطلبات حسب نوع الخدمة" icon={<BarChart3 size={18} />} />
        <div className="skeleton h-48 rounded-xl" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="الطلبات حسب نوع الخدمة"
        subtitle="توزيع الطلبات على الخدمات المختلفة"
        icon={<BarChart3 size={18} />}
      />
      <div className="h-52" style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.5)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Cairo, sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
            <Bar
              dataKey="value"
              radius={[6, 6, 0, 0]}
              fill="url(#barGradient)"
            >
              {data.map((_, index) => (
                <Cell key={index} fill={`hsl(${240 + index * 20}, 70%, 65%)`} />
              ))}
            </Bar>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#4F46E5" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Requests By Country Pie Chart ───────────────────────────
interface CountryChartProps {
  data?: PieData[];
  loading?: boolean;
}

const DEFAULT_PIE_DATA: PieData[] = [
  { name: '🇸🇦 السعودية', value: 45, color: '#6366F1' },
  { name: '🇰🇼 الكويت', value: 22, color: '#8B5CF6' },
  { name: '🇦🇪 الإمارات', value: 18, color: '#10B981' },
  { name: '🇶🇦 قطر', value: 10, color: '#F59E0B' },
  { name: '🇧🇭 البحرين', value: 5, color: '#EF4444' },
];

function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { percent?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div
      className="rounded-xl p-3 text-sm shadow-xl"
      style={{
        background: '#1E293B',
        border: '1px solid rgba(51,65,85,0.8)',
        fontFamily: 'Cairo, sans-serif',
        direction: 'rtl',
      }}
    >
      <p className="text-text font-semibold">{item.name}</p>
      <p className="text-accent-light font-bold">{item.value} طلب</p>
      {item.payload.percent && (
        <p className="text-text-subtle text-xs">{(item.payload.percent * 100).toFixed(1)}%</p>
      )}
    </div>
  );
}

export function RequestsByCountryChart({ data = DEFAULT_PIE_DATA, loading }: CountryChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="الطلبات حسب الدولة" icon={<PieIcon size={18} />} />
        <div className="skeleton h-48 rounded-xl" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="الطلبات حسب الدولة"
        subtitle="توزيع جغرافي للطلبات"
        icon={<PieIcon size={18} />}
      />
      <div className="h-52" style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.color}
                  stroke="rgba(30,41,59,0.5)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: '#94A3B8', fontSize: 11, fontFamily: 'Cairo, sans-serif' }}>
                  {value}
                </span>
              )}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Activity Over Time Area Chart ────────────────────────────
interface ActivityChartProps {
  data?: Array<{ date: string; requests: number; resolved: number }>;
  loading?: boolean;
}

const DEFAULT_ACTIVITY: ActivityChartProps['data'] = Array.from({ length: 14 }, (_, i) => ({
  date: `${i + 1}/5`,
  requests: Math.floor(Math.random() * 40 + 20),
  resolved: Math.floor(Math.random() * 30 + 10),
}));

export function ActivityChart({ data = DEFAULT_ACTIVITY, loading }: ActivityChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="النشاط خلال الأسبوعين الأخيرين" icon={<TrendingUp size={18} />} />
        <div className="skeleton h-48 rounded-xl" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="النشاط خلال الأسبوعين الأخيرين"
        subtitle="الطلبات الواردة والمُنجزة"
        icon={<TrendingUp size={18} />}
      />
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-accent" />
          <span className="text-xs text-text-muted">طلبات واردة</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-success" />
          <span className="text-xs text-text-muted">طلبات مُنجزة</span>
        </div>
      </div>
      <div className="h-44" style={{ direction: 'ltr' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="requestsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'Cairo, sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="requests"
              stroke="#6366F1"
              strokeWidth={2}
              fill="url(#requestsGrad)"
            />
            <Area
              type="monotone"
              dataKey="resolved"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#resolvedGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
