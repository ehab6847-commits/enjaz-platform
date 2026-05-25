import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── Class Names ─────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Date Helpers ─────────────────────────────────────────────
export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar });
}

export function formatDate(date: string | Date, fmt = 'dd/MM/yyyy'): string {
  return format(new Date(date), fmt, { locale: ar });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy - HH:mm', { locale: ar });
}

// ─── Country Helpers ─────────────────────────────────────────
export const COUNTRIES: Record<string, { name: string; flag: string }> = {
  SA: { name: 'السعودية', flag: '🇸🇦' },
  KW: { name: 'الكويت', flag: '🇰🇼' },
  QA: { name: 'قطر', flag: '🇶🇦' },
  AE: { name: 'الإمارات', flag: '🇦🇪' },
  BH: { name: 'البحرين', flag: '🇧🇭' },
  OM: { name: 'عمان', flag: '🇴🇲' },
  EG: { name: 'مصر', flag: '🇪🇬' },
  JO: { name: 'الأردن', flag: '🇯🇴' },
  LB: { name: 'لبنان', flag: '🇱🇧' },
  IQ: { name: 'العراق', flag: '🇮🇶' },
};

export function getCountryInfo(code: string) {
  return COUNTRIES[code] ?? { name: code, flag: '🌍' };
}

// ─── Service Types ─────────────────────────────────────────────
export const SERVICE_TYPES: Record<string, { label: string; color: string }> = {
  programming: { label: 'برمجة', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  research: { label: 'بحث علمي', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  presentations: { label: 'عروض تقديمية', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  translation: { label: 'ترجمة', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  design: { label: 'تصميم', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  writing: { label: 'كتابة', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  consulting: { label: 'استشارات', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  data_analysis: { label: 'تحليل بيانات', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  video: { label: 'فيديو', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  other: { label: 'أخرى', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
};

export function getServiceInfo(type: string) {
  return SERVICE_TYPES[type] ?? SERVICE_TYPES.other;
}

// ─── Priority Helpers ─────────────────────────────────────────
export const PRIORITIES = {
  urgent: { label: 'عاجل', className: 'badge-urgent', icon: '🔴' },
  normal: { label: 'عادي', className: 'badge-normal', icon: '🟡' },
  low: { label: 'منخفض', className: 'badge-low', icon: '🟢' },
} as const;

export type Priority = keyof typeof PRIORITIES;

// ─── Status Helpers ─────────────────────────────────────────────
export const STATUSES = {
  new: { label: 'جديد', className: 'badge-new' },
  seen: { label: 'مُشاهَد', className: 'badge-seen' },
  assigned: { label: 'مُعيَّن', className: 'badge-assigned' },
  archived: { label: 'أرشيف', className: 'badge-archived' },
} as const;

export type Status = keyof typeof STATUSES;

// ─── Confidence Helpers ────────────────────────────────────────
export function getConfidenceClass(score: number): string {
  if (score >= 75) return 'confidence-high';
  if (score >= 45) return 'confidence-medium';
  return 'confidence-low';
}

export function getConfidenceLabel(score: number): string {
  if (score >= 75) return 'عالية';
  if (score >= 45) return 'متوسطة';
  return 'منخفضة';
}

// ─── Number Formatting ────────────────────────────────────────
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ar-SA').format(n);
}

// ─── Truncate Text ────────────────────────────────────────────
export function truncate(str: string, maxLen = 80): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

// ─── Role Labels ─────────────────────────────────────────────
export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'مدير عام',
  admin: 'مشرف',
  specialist: 'مختص',
};

// ─── Arabic Day Names ─────────────────────────────────────────
const ARABIC_DAYS = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
];

export function getArabicDay(date = new Date()): string {
  return ARABIC_DAYS[date.getDay()];
}

// ─── Greeting ─────────────────────────────────────────────────
export function getArabicGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
}
