'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/contexts/SocketContext';
import { apiGet, apiPatch, apiDelete } from '@/lib/api';
import { StatusBadge, PriorityBadge, ServiceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Table';
import {
  Search,
  Filter,
  X,
  Eye,
  Archive,
  Trash2,
  ExternalLink,
  User,
  Globe,
  MessageSquare,
  Clock,
  Tag,
  RefreshCw,
  ChevronDown,
  Bell,
} from 'lucide-react';
import {
  timeAgo,
  formatDateTime,
  getCountryInfo,
  getServiceInfo,
  truncate,
  cn,
} from '@/lib/utils';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────
interface Request {
  id: string;
  messageId: string;
  sender: {
    name: string;
    username: string;
    telegramId: string;
    profileUrl?: string;
  };
  message: string;
  groupName: string;
  groupLink?: string;
  messageLink?: string;
  country: string;
  service: string;
  status: 'new' | 'seen' | 'assigned' | 'archived';
  priority: 'urgent' | 'normal' | 'low';
  confidence: number;
  keywords: string[];
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  telegramAccountId: string;
}

interface RequestsResponse {
  requests: Request[];
  total: number;
  page: number;
  pageSize: number;
}

interface Filters {
  search: string;
  country: string;
  service: string;
  status: string;
  priority: string;
}

// ─── Confidence Bar ────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const colorClass = value >= 75 ? 'confidence-high' : value >= 45 ? 'confidence-medium' : 'confidence-low';
  const textColor = value >= 75 ? 'text-success' : value >= 45 ? 'text-warning' : 'text-error';
  return (
    <div className="space-y-1 min-w-[80px]">
      <div className="confidence-bar">
        <div className={`confidence-fill ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
      <p className={`text-xs font-bold ${textColor}`}>{value}%</p>
    </div>
  );
}

// ─── Request Detail Modal ─────────────────────────────────────
function RequestDetailModal({
  request,
  onClose,
  onStatusChange,
}: {
  request: Request | null;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  if (!request) return null;
  const country = getCountryInfo(request.country);
  const service = getServiceInfo(request.service);

  return (
    <Modal
      isOpen={!!request}
      onClose={onClose}
      title="تفاصيل الطلب"
      subtitle={`#${request.id.slice(-8).toUpperCase()}`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Message */}
        <div className="p-4 rounded-xl bg-surface-2 border border-border">
          <p className="text-xs font-bold text-text-subtle uppercase mb-2">نص الرسالة</p>
          <p className="text-text text-sm leading-relaxed">{request.message}</p>
        </div>

        {/* Meta Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-1">
            <p className="text-xs text-text-subtle flex items-center gap-1.5">
              <User size={12} /> الطالب
            </p>
            <p className="text-sm font-semibold text-text">{request.sender.name}</p>
            <p className="text-xs text-text-subtle">@{request.sender.username}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-1">
            <p className="text-xs text-text-subtle flex items-center gap-1.5">
              <Globe size={12} /> الدولة
            </p>
            <p className="text-sm font-semibold text-text">{country.flag} {country.name}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-1">
            <p className="text-xs text-text-subtle flex items-center gap-1.5">
              <MessageSquare size={12} /> المجموعة
            </p>
            <p className="text-sm font-semibold text-text">{request.groupName}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-1">
            <p className="text-xs text-text-subtle flex items-center gap-1.5">
              <Clock size={12} /> الوقت
            </p>
            <p className="text-sm font-semibold text-text">{formatDateTime(request.createdAt)}</p>
          </div>
        </div>

        {/* Service & Priority & Status */}
        <div className="flex flex-wrap gap-3 items-center">
          <ServiceBadge type={service.type} label={service.label} />
          <PriorityBadge priority={request.priority} />
          <StatusBadge status={request.status} />
        </div>

        {/* Confidence */}
        <div className="p-4 rounded-xl bg-surface-2 border border-border">
          <p className="text-xs font-bold text-text-subtle uppercase mb-3 flex items-center gap-2">
            <span>🧠</span> معدل الثقة بالذكاء الاصطناعي
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 rounded-full overflow-hidden bg-surface-3">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    request.confidence >= 75
                      ? 'confidence-high'
                      : request.confidence >= 45
                      ? 'confidence-medium'
                      : 'confidence-low'
                  )}
                  style={{ width: `${request.confidence}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                'text-2xl font-black tabular-nums',
                request.confidence >= 75
                  ? 'text-success'
                  : request.confidence >= 45
                  ? 'text-warning'
                  : 'text-error'
              )}
            >
              {request.confidence}%
            </span>
          </div>
          <p className="text-xs text-text-subtle mt-2">
            {request.confidence >= 75
              ? 'ثقة عالية — الطلب محدد ومصنّف بدقة'
              : request.confidence >= 45
              ? 'ثقة متوسطة — يُنصح بمراجعة التصنيف'
              : 'ثقة منخفضة — يتطلب مراجعة يدوية'}
          </p>
        </div>

        {/* Keywords */}
        {request.keywords?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-text-subtle uppercase mb-2 flex items-center gap-1.5">
              <Tag size={12} /> الكلمات المفتاحية
            </p>
            <div className="flex flex-wrap gap-2">
              {request.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent-light border border-accent/20"
                >
                  #{kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-3">
          {request.messageLink && (
            <a
              href={request.messageLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-accent-light hover:text-accent transition-colors"
            >
              <ExternalLink size={14} />
              رابط الرسالة
            </a>
          )}
          {request.sender.profileUrl && (
            <a
              href={request.sender.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-accent-light hover:text-accent transition-colors"
            >
              <User size={14} />
              حساب المُرسِل
            </a>
          )}
        </div>

        {/* Status Actions */}
        <div>
          <p className="text-xs font-bold text-text-subtle uppercase mb-3">تغيير الحالة</p>
          <div className="flex flex-wrap gap-2">
            {(['new', 'seen', 'assigned', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(request.id, s)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  request.status === s
                    ? 'bg-accent text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                    : 'bg-surface-2 border border-border text-text-muted hover:border-accent/40 hover:text-text'
                )}
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Filters Bar ──────────────────────────────────────────────
const COUNTRIES = [
  { value: '', label: 'جميع الدول' },
  { value: 'SA', label: '🇸🇦 السعودية' },
  { value: 'KW', label: '🇰🇼 الكويت' },
  { value: 'QA', label: '🇶🇦 قطر' },
  { value: 'AE', label: '🇦🇪 الإمارات' },
  { value: 'BH', label: '🇧🇭 البحرين' },
];

const SERVICES = [
  { value: '', label: 'جميع الخدمات' },
  { value: 'programming', label: 'برمجة' },
  { value: 'research', label: 'بحث علمي' },
  { value: 'presentations', label: 'عروض تقديمية' },
  { value: 'translation', label: 'ترجمة' },
  { value: 'design', label: 'تصميم' },
  { value: 'writing', label: 'كتابة' },
  { value: 'consulting', label: 'استشارات' },
  { value: 'data_analysis', label: 'تحليل بيانات' },
  { value: 'video', label: 'فيديو' },
  { value: 'other', label: 'أخرى' },
];

const STATUSES = [
  { value: '', label: 'جميع الحالات' },
  { value: 'new', label: 'جديد' },
  { value: 'seen', label: 'مُشاهَد' },
  { value: 'assigned', label: 'مُعيَّن' },
  { value: 'archived', label: 'أرشيف' },
];

const PRIORITIES = [
  { value: '', label: 'جميع الأولويات' },
  { value: 'urgent', label: '🔴 عاجل' },
  { value: 'normal', label: '🟡 عادي' },
  { value: 'low', label: '🟢 منخفض' },
];

function SelectFilter({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pl-8 pr-4 rounded-xl text-sm bg-surface border border-border text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 cursor-pointer appearance-none transition-all font-cairo"
        dir="rtl"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function RequestsPage() {
  const queryClient = useQueryClient();
  const { on, off } = useSocket();
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    country: '',
    service: '',
    status: '',
    priority: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters);
  const [hasNewRequest, setHasNewRequest] = useState(false);

  const PAGE_SIZE = 20;

  // Fetch requests
  const { data, isLoading, isFetching, refetch } = useQuery<RequestsResponse>({
    queryKey: ['requests', appliedFilters, page],
    queryFn: async () => {
      const params: Record<string, any> = {
        page,
        limit: PAGE_SIZE,
      };

      if (appliedFilters.search) params.search = appliedFilters.search;
      if (appliedFilters.country) params.country = appliedFilters.country;

      if (appliedFilters.service) {
        const serviceMap: Record<string, string> = {
          programming: 'برمجة',
          research: 'بحث',
          presentations: 'عروض',
          translation: 'ترجمة',
          design: 'تصميم',
          writing: 'واجبات',
          consulting: 'استشارات',
          data_analysis: 'تحليل بيانات',
          video: 'فيديو',
        };
        params.serviceType = serviceMap[appliedFilters.service] || appliedFilters.service;
      }

      if (appliedFilters.status) {
        const statusMap: Record<string, string> = {
          new: 'NEW',
          seen: 'VIEWED',
          assigned: 'ASSIGNED',
          archived: 'ARCHIVED',
        };
        params.status = statusMap[appliedFilters.status] || appliedFilters.status.toUpperCase();
      }

      if (appliedFilters.priority) {
        params.priority = appliedFilters.priority.toUpperCase();
      }

      const response = await apiGet<any>('/requests', params);

      const mappedRequests = (response.data || []).map((req: any) => ({
        id: req.id,
        messageId: req.id,
        sender: {
          name: req.senderName || 'مجهول',
          username: req.senderUsername || 'unknown',
          telegramId: req.senderId || '',
          profileUrl: req.profileLink || undefined,
        },
        message: req.messageText || '',
        groupName: req.groupName || 'غير معروفة',
        messageLink: req.messageLink || undefined,
        country: req.country || '',
        service: req.serviceType || '',
        status: (req.status || 'NEW').toLowerCase(),
        priority: (req.priority || 'NORMAL').toLowerCase(),
        confidence: Math.round(req.confidenceScore * 100) || 0,
        keywords: req.keywords || [],
        createdAt: req.capturedAt || req.createdAt || new Date().toISOString(),
        updatedAt: req.capturedAt || new Date().toISOString(),
      }));

      return {
        requests: mappedRequests,
        total: response.pagination?.total || 0,
        page: response.pagination?.page || 1,
        pageSize: response.pagination?.limit || PAGE_SIZE,
      };
    },
    staleTime: 15000,
    refetchInterval: 3000, // Auto-refresh requests list every 3 seconds
  });

  // Real-time new request
  useEffect(() => {
    const handler = () => {
      setHasNewRequest(true);
      toast('📋 طلب جديد وصل!', {
        duration: 6000,
        style: {
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.4)',
          color: '#E2E8F0',
        },
      });
    };
    on('new_request', handler);
    return () => off('new_request', handler);
  }, [on, off]);

  // Status update mutation
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      const statusMap: Record<string, string> = {
        new: 'NEW',
        seen: 'VIEWED',
        assigned: 'ASSIGNED',
        archived: 'ARCHIVED',
      };
      const dbStatus = statusMap[status] || status.toUpperCase();
      return apiPatch(`/requests/${id}/status`, { status: dbStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('تم تحديث الحالة');
      if (selectedRequest) {
        setSelectedRequest((prev) => prev ? { ...prev, status: 'seen' as const } : null);
      }
    },
  });

  // Archive mutation
  const archiveRequest = useMutation({
    mutationFn: (id: string) => apiPatch(`/requests/${id}/status`, { status: 'ARCHIVED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('تم أرشفة الطلب');
    },
  });

  // Delete mutation
  const deleteRequest = useMutation({
    mutationFn: (id: string) => apiDelete(`/requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('تم حذف الطلب');
    },
  });

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleClearFilters = () => {
    const empty = { search: '', country: '', service: '', status: '', priority: '' };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  };

  const hasActiveFilters = Object.values(appliedFilters).some((v) => v !== '');
  const requests = data?.requests ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text flex items-center gap-2">
            📋 إدارة الطلبات
          </h1>
          <p className="text-text-subtle text-sm mt-1">
            {total > 0 ? `${total.toLocaleString('ar-SA')} طلب إجمالاً` : 'لا توجد طلبات'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasNewRequest && (
            <button
              onClick={() => {
                setHasNewRequest(false);
                refetch();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/15 border border-accent/30 text-accent-light text-sm font-medium hover:bg-accent/25 transition-all animate-pulse"
            >
              <Bell size={15} />
              طلبات جديدة! انقر للتحديث
            </button>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 rounded-xl bg-surface border border-border text-text-subtle hover:text-text transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── Filters ─────────────────────────────────────────── */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
              <input
                type="text"
                placeholder="البحث في الطلبات..."
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                className="h-10 w-full pr-9 pl-4 rounded-xl text-sm bg-surface border border-border text-text placeholder:text-text-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all font-cairo"
                dir="rtl"
              />
            </div>
          </div>

          {/* Country */}
          <SelectFilter
            value={filters.country}
            onChange={(v) => setFilters((p) => ({ ...p, country: v }))}
            options={COUNTRIES}
          />

          {/* Service */}
          <SelectFilter
            value={filters.service}
            onChange={(v) => setFilters((p) => ({ ...p, service: v }))}
            options={SERVICES}
          />

          {/* Status */}
          <SelectFilter
            value={filters.status}
            onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
            options={STATUSES}
          />

          {/* Priority */}
          <SelectFilter
            value={filters.priority}
            onChange={(v) => setFilters((p) => ({ ...p, priority: v }))}
            options={PRIORITIES}
          />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleApplyFilters}
              icon={<Filter size={14} />}
            >
              تطبيق
            </Button>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearFilters}
                icon={<X size={14} />}
              >
                مسح
              </Button>
            )}
          </div>
        </div>

        {/* Active filters tags */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
            <span className="text-xs text-text-subtle">الفلاتر المطبقة:</span>
            {appliedFilters.search && (
              <span className="badge badge-new text-xs">بحث: {appliedFilters.search}</span>
            )}
            {appliedFilters.country && (
              <span className="badge badge-new text-xs">
                {getCountryInfo(appliedFilters.country).flag} {getCountryInfo(appliedFilters.country).name}
              </span>
            )}
            {appliedFilters.service && (
              <span className="badge badge-new text-xs">{getServiceInfo(appliedFilters.service).label}</span>
            )}
            {appliedFilters.status && (
              <StatusBadge status={appliedFilters.status as 'new' | 'seen' | 'assigned' | 'archived'} />
            )}
            {appliedFilters.priority && (
              <PriorityBadge priority={appliedFilters.priority as 'urgent' | 'normal' | 'low'} />
            )}
          </div>
        )}
      </div>

      {/* ─── Table ───────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>الرسالة</th>
                <th>المجموعة</th>
                <th>الدولة</th>
                <th>الخدمة</th>
                <th>الثقة</th>
                <th>الأولوية</th>
                <th>الحالة</th>
                <th>الوقت</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j}>
                          <div className="skeleton h-4 rounded w-full max-w-[100px]" />
                        </td>
                      ))}
                    </tr>
                  ))
                : requests.length === 0
                ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <span className="text-5xl opacity-30">📭</span>
                        <p className="text-text-subtle text-sm">لا توجد طلبات تطابق معايير البحث</p>
                        {hasActiveFilters && (
                          <button
                            onClick={handleClearFilters}
                            className="text-accent-light text-sm hover:underline"
                          >
                            مسح الفلاتر
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
                : requests.map((req) => {
                    const country = getCountryInfo(req.country);
                    const service = getServiceInfo(req.service);
                    return (
                      <tr
                        key={req.id}
                        className={cn(
                          req.status === 'new' && 'border-r-2 border-r-info'
                        )}
                      >
                        <td>
                          <div>
                            <p className="text-sm font-semibold text-text">{req.sender.name}</p>
                            <p className="text-xs text-text-subtle">@{req.sender.username}</p>
                          </div>
                        </td>
                        <td>
                          <p
                            className="text-sm text-text-muted max-w-[180px] cursor-pointer hover:text-text transition-colors"
                            title={req.message}
                            onClick={() => setSelectedRequest(req)}
                          >
                            {truncate(req.message, 60)}
                          </p>
                        </td>
                        <td>
                          <p className="text-xs text-text-muted max-w-[120px] truncate" title={req.groupName}>
                            {req.groupName}
                          </p>
                        </td>
                        <td>
                          <span className="text-sm whitespace-nowrap">
                            {country.flag} {country.name}
                          </span>
                        </td>
                        <td>
                          <ServiceBadge type={service.type} label={service.label} />
                        </td>
                        <td>
                          <ConfidenceBar value={req.confidence} />
                        </td>
                        <td>
                          <PriorityBadge priority={req.priority} />
                        </td>
                        <td>
                          <StatusBadge status={req.status} />
                        </td>
                        <td>
                          <span className="text-xs text-text-subtle whitespace-nowrap">
                            {timeAgo(req.createdAt)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setSelectedRequest(req)}
                              className="p-1.5 rounded-lg text-text-subtle hover:text-accent hover:bg-accent/10 transition-colors"
                              title="عرض التفاصيل"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => archiveRequest.mutate(req.id)}
                              className="p-1.5 rounded-lg text-text-subtle hover:text-warning hover:bg-warning/10 transition-colors"
                              title="أرشفة"
                            >
                              <Archive size={15} />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
                                  deleteRequest.mutate(req.id);
                                }
                              }}
                              className="p-1.5 rounded-lg text-text-subtle hover:text-error hover:bg-error/10 transition-colors"
                              title="حذف"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="px-4 pb-4">
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </div>
        )}
      </div>

      {/* ─── Detail Modal ─────────────────────────────────────── */}
      <RequestDetailModal
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onStatusChange={(id, status) => {
          updateStatus.mutate({ id, status });
          setSelectedRequest((prev) =>
            prev ? { ...prev, status: status as Request['status'] } : null
          );
        }}
      />
    </div>
  );
}
