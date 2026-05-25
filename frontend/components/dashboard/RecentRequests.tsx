'use client';

import React from 'react';
import { Card, CardHeader, CardFooter } from '@/components/ui/Card';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { ClipboardList, ArrowLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { timeAgo, getCountryInfo, getServiceInfo, truncate } from '@/lib/utils';

interface Request {
  id: string;
  sender: { name: string; username: string };
  message: string;
  country: string;
  service: string;
  status: 'new' | 'seen' | 'assigned' | 'archived';
  priority: 'urgent' | 'normal' | 'low';
  confidence: number;
  createdAt: string;
  groupName?: string;
}

interface RecentRequestsProps {
  requests?: Request[];
  loading?: boolean;
}

const SAMPLE_REQUESTS: Request[] = [
  {
    id: '1',
    sender: { name: 'محمد الأحمدي', username: 'mohammed_a' },
    message: 'أحتاج مساعدة في بناء موقع إلكتروني بـ React وNode.js، المشروع عاجل جداً',
    country: 'SA',
    service: 'programming',
    status: 'new',
    priority: 'urgent',
    confidence: 92,
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    groupName: 'مجتمع المطورين السعوديين',
  },
  {
    id: '2',
    sender: { name: 'فاطمة الكويتية', username: 'fatema_k' },
    message: 'أبحث عن باحث لإعداد دراسة جدوى اقتصادية لمشروع عقاري',
    country: 'KW',
    service: 'research',
    status: 'seen',
    priority: 'normal',
    confidence: 78,
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    groupName: 'أعمال الكويت',
  },
  {
    id: '3',
    sender: { name: 'أحمد المنصوري', username: 'ahmed_m' },
    message: 'أريد تصميم شعار وهوية بصرية كاملة لشركة ناشئة في مجال التقنية',
    country: 'AE',
    service: 'design',
    status: 'assigned',
    priority: 'normal',
    confidence: 85,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    groupName: 'رواد الأعمال الإماراتيين',
  },
  {
    id: '4',
    sender: { name: 'نورة القحطاني', username: 'noura_q' },
    message: 'أحتاج ترجمة وثيقة رسمية من العربية للإنجليزية بشكل عاجل',
    country: 'SA',
    service: 'translation',
    status: 'new',
    priority: 'urgent',
    confidence: 95,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    groupName: 'خدمات الترجمة',
  },
  {
    id: '5',
    sender: { name: 'خالد العتيبي', username: 'khaled_a' },
    message: 'أريد مساعدة في إعداد عرض تقديمي لمشروع تخرج في كلية إدارة الأعمال',
    country: 'QA',
    service: 'presentations',
    status: 'new',
    priority: 'low',
    confidence: 65,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    groupName: 'طلاب قطر الجامعيين',
  },
];

function ConfidenceBar({ value }: { value: number }) {
  const colorClass =
    value >= 75 ? 'confidence-high' : value >= 45 ? 'confidence-medium' : 'confidence-low';
  return (
    <div className="flex items-center gap-2">
      <div className="confidence-bar w-16">
        <div
          className={`confidence-fill ${colorClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-text-subtle tabular-nums">{value}%</span>
    </div>
  );
}

export function RecentRequests({ requests = SAMPLE_REQUESTS, loading }: RecentRequestsProps) {
  return (
    <Card padding="none">
      <div className="p-6 pb-0">
        <CardHeader
          title="آخر الطلبات"
          subtitle={`${requests.length} طلباً حديثاً`}
          icon={<ClipboardList size={18} />}
          actions={
            <Link
              href="/dashboard/requests"
              className="text-xs text-accent-light hover:text-accent flex items-center gap-1 transition-colors"
            >
              عرض الكل
              <ArrowLeft size={12} />
            </Link>
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>الطالب</th>
              <th>الرسالة</th>
              <th>الدولة</th>
              <th>الخدمة</th>
              <th>الثقة</th>
              <th>الأولوية</th>
              <th>الحالة</th>
              <th>الوقت</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j}>
                        <div className="skeleton h-4 rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              : requests.map((req) => {
                  const country = getCountryInfo(req.country);
                  const service = getServiceInfo(req.service);
                  return (
                    <tr key={req.id}>
                      <td>
                        <div>
                          <p className="text-sm font-semibold text-text">{req.sender.name}</p>
                          <p className="text-xs text-text-subtle">@{req.sender.username}</p>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm text-text-muted max-w-[200px]">
                          {truncate(req.message, 60)}
                        </p>
                      </td>
                      <td>
                        <span className="text-sm">
                          {country.flag} {country.name}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${service.color}`}
                        >
                          {service.label}
                        </span>
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
                        <Link
                          href={`/dashboard/requests?id=${req.id}`}
                          className="p-1.5 rounded-lg text-text-subtle hover:text-accent hover:bg-accent/10 transition-colors inline-flex"
                        >
                          <Eye size={15} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default RecentRequests;
