'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Table';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  ChevronDown,
  Bug,
  Server,
  Shield,
  MessageSquare,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────
interface ProcessingError {
  id: string;
  messageText: string | null;
  groupName: string | null;
  groupId: string | null;
  accountPhone: string | null;
  errorType: string;
  errorMessage: string;
  errorStack: string | null;
  rawData: string | null;
  resolved: boolean;
  createdAt: string;
}

interface ErrorsResponse {
  data: ProcessingError[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ErrorStats {
  total: number;
  unresolved: number;
  byType: { type: string; count: number }[];
}

interface FeedbackStats {
  total: number;
  correct: number;
  wrongRequest: number;
  advertiser: number;
  spam: number;
  ignore: number;
  accuracy: number;
}

// ─── Error Type Config ──────────────────────────────────────
const ERROR_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  sender_extraction: {
    label: 'استخراج المرسل',
    icon: <MessageSquare size={14} />,
    color: 'text-warning',
  },
  classification: {
    label: 'التصنيف',
    icon: <Shield size={14} />,
    color: 'text-accent-light',
  },
  forwarding: {
    label: 'التوجيه',
    icon: <Server size={14} />,
    color: 'text-error',
  },
  db_save: {
    label: 'حفظ البيانات',
    icon: <Database size={14} />,
    color: 'text-error',
  },
};

function getErrorTypeInfo(type: string) {
  return ERROR_TYPE_CONFIG[type] || { label: type, icon: <Bug size={14} />, color: 'text-text-subtle' };
}

// ─── Stats Cards ──────────────────────────────────────────────
function StatsSection({ errorStats, feedbackStats }: { errorStats?: ErrorStats; feedbackStats?: FeedbackStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Errors */}
      <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-1">
        <p className="text-xs text-text-subtle">إجمالي الأخطاء</p>
        <p className="text-2xl font-black text-text tabular-nums">{errorStats?.total ?? 0}</p>
        <p className="text-xs text-error">
          {errorStats?.unresolved ?? 0} غير محلول
        </p>
      </div>

      {/* Feedback Total */}
      <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-1">
        <p className="text-xs text-text-subtle">إجمالي التقييمات</p>
        <p className="text-2xl font-black text-text tabular-nums">{feedbackStats?.total ?? 0}</p>
        <p className="text-xs text-success">
          {feedbackStats?.correct ?? 0} تصنيف صحيح
        </p>
      </div>

      {/* AI Accuracy */}
      <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-1">
        <p className="text-xs text-text-subtle">دقة الذكاء الاصطناعي</p>
        <p className={cn(
          'text-2xl font-black tabular-nums',
          (feedbackStats?.accuracy ?? 0) >= 80 ? 'text-success' :
          (feedbackStats?.accuracy ?? 0) >= 50 ? 'text-warning' : 'text-error'
        )}>
          {feedbackStats?.accuracy ?? 0}%
        </p>
        <p className="text-xs text-text-subtle">
          بناءً على {feedbackStats?.total ?? 0} تقييم
        </p>
      </div>

      {/* Feedback Breakdown */}
      <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-1">
        <p className="text-xs text-text-subtle">أخطاء التصنيف</p>
        <div className="flex gap-3 mt-1">
          <span className="text-xs text-warning">{feedbackStats?.wrongRequest ?? 0} ليس طلب</span>
          <span className="text-xs text-error">{feedbackStats?.advertiser ?? 0} إعلان</span>
          <span className="text-xs text-error">{feedbackStats?.spam ?? 0} سبام</span>
        </div>
      </div>
    </div>
  );
}

// ─── Error Row ────────────────────────────────────────────────
function ErrorRow({
  error,
  onResolve,
}: {
  error: ProcessingError;
  onResolve: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = getErrorTypeInfo(error.errorType);
  const timeStr = new Date(error.createdAt).toLocaleString('ar-SA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={cn(
      'border border-border rounded-xl overflow-hidden transition-all',
      error.resolved ? 'bg-surface-2/50 opacity-60' : 'bg-surface-2'
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-right hover:bg-surface-3/50 transition-colors"
      >
        <div className={cn('flex-shrink-0', typeInfo.color)}>
          {typeInfo.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', typeInfo.color, 'border-current/20 bg-current/5')}>
              {typeInfo.label}
            </span>
            {error.resolved ? (
              <span className="text-xs text-success flex items-center gap-1">
                <CheckCircle size={12} /> تم الحل
              </span>
            ) : (
              <span className="text-xs text-error flex items-center gap-1">
                <XCircle size={12} /> غير محلول
              </span>
            )}
          </div>
          <p className="text-sm text-text mt-1 truncate">{error.errorMessage}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-text-subtle">{timeStr}</span>
          <ChevronDown size={16} className={cn('text-text-subtle transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Details */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {error.groupName && (
            <div>
              <p className="text-xs text-text-subtle mb-1">المجموعة</p>
              <p className="text-sm text-text">{error.groupName} ({error.groupId})</p>
            </div>
          )}
          {error.accountPhone && (
            <div>
              <p className="text-xs text-text-subtle mb-1">الحساب</p>
              <p className="text-sm text-text">{error.accountPhone}</p>
            </div>
          )}
          {error.messageText && (
            <div>
              <p className="text-xs text-text-subtle mb-1">نص الرسالة</p>
              <p className="text-sm text-text bg-surface-3 rounded-lg p-3 max-h-24 overflow-y-auto">
                {error.messageText}
              </p>
            </div>
          )}
          {error.errorStack && (
            <div>
              <p className="text-xs text-text-subtle mb-1">Stack Trace</p>
              <pre className="text-xs text-text-muted bg-surface-3 rounded-lg p-3 max-h-32 overflow-auto font-mono direction-ltr text-left">
                {error.errorStack}
              </pre>
            </div>
          )}
          {!error.resolved && (
            <button
              onClick={() => onResolve(error.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-all"
            >
              <CheckCircle size={14} /> تحديد كمحلول
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function LogsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [errorTypeFilter, setErrorTypeFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('');
  const limit = 15;

  // Fetch errors
  const { data: errorsData, isLoading: errorsLoading } = useQuery<ErrorsResponse>({
    queryKey: ['processing-errors', page, errorTypeFilter, resolvedFilter],
    queryFn: () => {
      const params: Record<string, unknown> = { page, limit };
      if (errorTypeFilter) params.errorType = errorTypeFilter;
      if (resolvedFilter) params.resolved = resolvedFilter;
      return apiGet<ErrorsResponse>('/errors', params);
    },
  });

  // Fetch error stats
  const { data: errorStats } = useQuery<ErrorStats>({
    queryKey: ['error-stats'],
    queryFn: () => apiGet<ErrorStats>('/errors/stats'),
    refetchInterval: 60000,
  });

  // Fetch feedback stats
  const { data: feedbackStats } = useQuery<FeedbackStats>({
    queryKey: ['feedback-stats'],
    queryFn: () => apiGet<FeedbackStats>('/feedback/stats'),
    refetchInterval: 60000,
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiPut(`/errors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing-errors'] });
      queryClient.invalidateQueries({ queryKey: ['error-stats'] });
      toast.success('تم تحديد الخطأ كمحلول');
    },
    onError: () => toast.error('فشل تحديث الخطأ'),
  });

  const errors = errorsData?.data ?? [];
  const pagination = errorsData?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text">السجلات</h1>
          <p className="text-sm text-text-subtle mt-1">مراقبة أداء النظام وتقييمات الذكاء الاصطناعي</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['processing-errors'] });
            queryClient.invalidateQueries({ queryKey: ['error-stats'] });
            queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
          }}
        >
          <RefreshCw size={16} /> تحديث
        </Button>
      </div>

      {/* Stats */}
      <StatsSection errorStats={errorStats} feedbackStats={feedbackStats} />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-text-subtle">
          <Filter size={14} />
          <span>فلترة:</span>
        </div>

        <select
          value={errorTypeFilter}
          onChange={(e) => { setErrorTypeFilter(e.target.value); setPage(1); }}
          className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="">جميع الأنواع</option>
          <option value="sender_extraction">استخراج المرسل</option>
          <option value="classification">التصنيف</option>
          <option value="forwarding">التوجيه</option>
          <option value="db_save">حفظ البيانات</option>
        </select>

        <select
          value={resolvedFilter}
          onChange={(e) => { setResolvedFilter(e.target.value); setPage(1); }}
          className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="">الكل</option>
          <option value="false">غير محلول</option>
          <option value="true">محلول</option>
        </select>
      </div>

      {/* Error List */}
      <div className="space-y-3">
        {errorsLoading ? (
          <div className="text-center py-12 text-text-subtle">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
            <p>جاري التحميل...</p>
          </div>
        ) : errors.length === 0 ? (
          <div className="text-center py-16 text-text-subtle">
            <CheckCircle size={48} className="mx-auto mb-4 text-success/50" />
            <p className="text-lg font-semibold">لا توجد أخطاء</p>
            <p className="text-sm mt-1">النظام يعمل بشكل سليم ✨</p>
          </div>
        ) : (
          errors.map((error) => (
            <ErrorRow
              key={error.id}
              error={error}
              onResolve={(id) => resolveMutation.mutate(id)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
