'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentRequests } from '@/components/dashboard/RecentRequests';
import {
  RequestsByServiceChart,
  RequestsByCountryChart,
  ActivityChart,
} from '@/components/dashboard/RequestsChart';
import { apiGet } from '@/lib/api';
import { formatDate, getArabicDay, getArabicGreeting } from '@/lib/utils';
import {
  ClipboardList,
  Sparkles,
  Smartphone,
  Brain,
  RefreshCw,
  Wifi,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DashboardStats {
  totalTodayRequests: number;
  newRequests: number;
  activeTelegramAccounts: number;
  avgConfidence: number;
  trends: {
    totalTodayRequests: { value: number; direction: 'up' | 'down' | 'neutral' };
    newRequests: { value: number; direction: 'up' | 'down' | 'neutral' };
    activeTelegramAccounts: { value: number; direction: 'up' | 'down' | 'neutral' };
    avgConfidence: { value: number; direction: 'up' | 'down' | 'neutral' };
  };
  recentRequests: unknown[];
  byService: Array<{ name: string; value: number }>;
  byCountry: Array<{ name: string; value: number; color: string }>;
  activity: Array<{ date: string; requests: number; resolved: number }>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { isConnected, on, off } = useSocket();
  const [newRequestAlert, setNewRequestAlert] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiGet<DashboardStats>('/dashboard/stats'),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Real-time new request notification
  useEffect(() => {
    const handleNewRequest = (data: unknown) => {
      setNewRequestAlert(true);
      const req = data as { sender?: { name?: string }; service?: string };
      toast(
        (t) => (
          <div
            className="flex items-start gap-3"
            style={{ fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}
          >
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0 text-accent-light text-sm">
              📋
            </div>
            <div>
              <p className="font-bold text-sm">طلب جديد!</p>
              <p className="text-xs text-text-muted">
                من: {req?.sender?.name || 'مستخدم'} • {req?.service || ''}
              </p>
            </div>
          </div>
        ),
        { duration: 5000 }
      );
      refetch();
      setTimeout(() => setNewRequestAlert(false), 3000);
    };

    on('new_request', handleNewRequest);
    return () => off('new_request', handleNewRequest);
  }, [on, off, refetch]);

  const today = new Date();
  const arabicDate = `${getArabicDay(today)}، ${formatDate(today, 'dd MMMM yyyy')}`;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl animate-bounce-gentle">👋</span>
            <h1 className="text-2xl font-black text-text">
              {getArabicGreeting()}،{' '}
              <span className="gradient-text">
                {user?.displayName || user?.username}
              </span>
            </h1>
          </div>
          <p className="text-text-subtle text-sm flex items-center gap-2">
            <span>{arabicDate}</span>
            <span className="w-1 h-1 rounded-full bg-text-subtle inline-block" />
            <span className={isConnected ? 'text-success' : 'text-error'}>
              {isConnected ? '🟢 متصل بالخادم' : '🔴 غير متصل'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection badge */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              isConnected
                ? 'bg-success/10 border-success/20 text-success'
                : 'bg-error/10 border-error/20 text-error'
            }`}
          >
            {isConnected ? <Wifi size={13} /> : <Wifi size={13} className="opacity-50" />}
            <span>{isConnected ? 'Live' : 'Offline'}</span>
            {newRequestAlert && (
              <span className="w-2 h-2 rounded-full bg-success animate-ping" />
            )}
          </div>

          <button
            onClick={() => refetch()}
            className="p-2.5 rounded-xl bg-surface border border-border text-text-subtle hover:text-text hover:border-accent/30 transition-all"
            title="تحديث البيانات"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ─── Stats Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي طلبات اليوم"
          value={stats?.totalTodayRequests ?? 0}
          icon={<ClipboardList size={22} />}
          color="accent"
          loading={isLoading}
          trend={
            stats?.trends.totalTodayRequests
              ? {
                  value: stats.trends.totalTodayRequests.value,
                  direction: stats.trends.totalTodayRequests.direction,
                  label: 'مقارنة بالأمس',
                }
              : undefined
          }
        />
        <StatCard
          title="طلبات جديدة"
          value={stats?.newRequests ?? 0}
          icon={<Sparkles size={22} />}
          color="warning"
          loading={isLoading}
          trend={
            stats?.trends.newRequests
              ? {
                  value: stats.trends.newRequests.value,
                  direction: stats.trends.newRequests.direction,
                  label: 'منذ آخر ساعة',
                }
              : undefined
          }
        />
        <StatCard
          title="حسابات تيليجرام"
          value={stats?.activeTelegramAccounts ?? 0}
          icon={<Smartphone size={22} />}
          color="success"
          loading={isLoading}
          subtitle="حساب نشط"
          trend={
            stats?.trends.activeTelegramAccounts
              ? {
                  value: stats.trends.activeTelegramAccounts.value,
                  direction: stats.trends.activeTelegramAccounts.direction,
                  label: 'مقارنة بالأسبوع الماضي',
                }
              : undefined
          }
        />
        <StatCard
          title="معدل ثقة الذكاء الاصطناعي"
          value={stats?.avgConfidence ?? 0}
          icon={<Brain size={22} />}
          color="info"
          loading={isLoading}
          suffix="%"
          trend={
            stats?.trends.avgConfidence
              ? {
                  value: stats.trends.avgConfidence.value,
                  direction: stats.trends.avgConfidence.direction,
                  label: 'دقة تصنيف الطلبات',
                }
              : undefined
          }
        />
      </div>

      {/* ─── Charts Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ActivityChart
            data={stats?.activity}
            loading={isLoading}
          />
        </div>
        <div>
          <RequestsByCountryChart
            data={stats?.byCountry}
            loading={isLoading}
          />
        </div>
      </div>

      {/* ─── Service Chart ──────────────────────────────────── */}
      <RequestsByServiceChart
        data={stats?.byService}
        loading={isLoading}
      />

      {/* ─── Recent Requests ─────────────────────────────────── */}
      <RecentRequests
        requests={stats?.recentRequests as Parameters<typeof RecentRequests>[0]['requests']}
        loading={isLoading}
      />
    </div>
  );
}
