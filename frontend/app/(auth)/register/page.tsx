'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { User, Mail, Lock, Phone, Briefcase, ChevronLeft, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const SPECIALIZATIONS = [
  { value: 'programming', label: '💻 برمجة وتطوير' },
  { value: 'research', label: '📚 بحث علمي' },
  { value: 'presentations', label: '📊 عروض تقديمية' },
  { value: 'translation', label: '🌐 ترجمة' },
  { value: 'design', label: '🎨 تصميم جرافيك' },
  { value: 'writing', label: '✍️ كتابة إبداعية' },
  { value: 'consulting', label: '💼 استشارات أعمال' },
  { value: 'data_analysis', label: '📈 تحليل بيانات' },
  { value: 'video', label: '🎬 إنتاج فيديو' },
  { value: 'other', label: '📌 أخرى' },
];

interface FormData {
  fullName: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  specialization: string;
  whatsapp: string;
  bio: string;
}

interface Errors {
  [key: string]: string;
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormData>({
    fullName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    whatsapp: '',
    bio: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const e: Errors = {};
    if (!form.fullName.trim()) e.fullName = 'الاسم الكامل مطلوب';
    else if (form.fullName.trim().length < 3) e.fullName = 'الاسم قصير جداً';

    if (!form.email.trim()) e.email = 'البريد الإلكتروني مطلوب';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'البريد الإلكتروني غير صحيح';

    if (!form.username.trim()) e.username = 'اسم المستخدم مطلوب';
    else if (form.username.length < 3) e.username = 'اسم المستخدم قصير جداً';
    else if (!/^[a-zA-Z0-9_]+$/.test(form.username)) e.username = 'يجب أن يحتوي على حروف وأرقام فقط';

    if (!form.password) e.password = 'كلمة المرور مطلوبة';
    else if (form.password.length < 8) e.password = 'يجب أن تكون 8 أحرف على الأقل';
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password))
      e.password = 'يجب أن تحتوي على حروف كبيرة وصغيرة وأرقام';

    if (!form.confirmPassword) e.confirmPassword = 'تأكيد كلمة المرور مطلوب';
    else if (form.confirmPassword !== form.password) e.confirmPassword = 'كلمتا المرور غير متطابقتين';

    if (!form.specialization) e.specialization = 'التخصص مطلوب';

    if (!form.whatsapp.trim()) e.whatsapp = 'رقم الواتساب مطلوب';
    else if (!/^\+?[\d\s\-()]{8,15}$/.test(form.whatsapp)) e.whatsapp = 'رقم الهاتف غير صحيح';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      await api.post('/auth/register', {
        fullName: form.fullName,
        email: form.email,
        username: form.username,
        password: form.password,
        specialization: form.specialization,
        whatsapp: form.whatsapp,
        bio: form.bio,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg?.includes('email') || msg?.includes('بريد')) {
        setErrors({ email: 'البريد الإلكتروني مستخدم بالفعل' });
      } else if (msg?.includes('username') || msg?.includes('مستخدم')) {
        setErrors({ username: 'اسم المستخدم مستخدم بالفعل' });
      } else {
        toast.error(msg || 'حدث خطأ في إرسال الطلب');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div
          className="max-w-md w-full rounded-3xl p-8 text-center"
          style={{
            background: 'rgba(30, 41, 59, 0.9)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
          }}
        >
          <div className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-success" />
          </div>
          <h2 className="text-2xl font-black text-text mb-3">تم إرسال طلبك!</h2>
          <p className="text-text-muted leading-relaxed mb-6">
            تم استقبال طلب الانضمام بنجاح. سيتم مراجعة طلبك من قِبل الإدارة وإبلاغك عبر البريد الإلكتروني أو واتساب.
          </p>
          <div className="p-4 rounded-xl bg-surface-2 border border-border text-right mb-6">
            <p className="text-sm text-text-muted">متوقع الرد خلال:</p>
            <p className="text-lg font-bold text-text mt-1">24-48 ساعة</p>
          </div>
          <Link
            href="/login"
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
          >
            <ChevronLeft size={16} />
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/login" className="inline-flex items-center gap-2 text-text-muted hover:text-text text-sm mb-6 transition-colors group">
            <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            العودة لتسجيل الدخول
          </Link>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-4xl">🚀</span>
            <h1 className="text-3xl font-black gradient-text">منصة إنجاز</h1>
          </div>
          <p className="text-text-muted text-sm">طلب انضمام المختصين</p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-3xl p-8 relative overflow-hidden"
          style={{
            background: 'rgba(30, 41, 59, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />

          <div className="mb-6">
            <h2 className="text-xl font-bold text-text">طلب الانضمام</h2>
            <p className="text-text-subtle text-sm mt-1">أكمل البيانات التالية للانضمام كمختص</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Full Name */}
            <Input
              label="الاسم الكامل"
              placeholder="محمد أحمد الأحمد"
              value={form.fullName}
              onChange={updateField('fullName')}
              icon={<User size={16} />}
              error={errors.fullName}
              autoComplete="name"
            />

            {/* Email */}
            <Input
              type="email"
              label="البريد الإلكتروني"
              placeholder="example@email.com"
              value={form.email}
              onChange={updateField('email')}
              icon={<Mail size={16} />}
              error={errors.email}
              autoComplete="email"
              style={{ direction: 'ltr', textAlign: 'right' }}
            />

            {/* Username */}
            <Input
              label="اسم المستخدم"
              placeholder="username123"
              value={form.username}
              onChange={updateField('username')}
              icon={<User size={16} />}
              error={errors.username}
              autoComplete="username"
              style={{ direction: 'ltr', textAlign: 'right' }}
            />

            {/* Passwords */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                type="password"
                label="كلمة المرور"
                placeholder="••••••••"
                value={form.password}
                onChange={updateField('password')}
                icon={<Lock size={16} />}
                error={errors.password}
                autoComplete="new-password"
              />
              <Input
                type="password"
                label="تأكيد كلمة المرور"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={updateField('confirmPassword')}
                icon={<Lock size={16} />}
                error={errors.confirmPassword}
                autoComplete="new-password"
              />
            </div>

            {/* Specialization */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-muted">التخصص</label>
              <div className="relative">
                <Briefcase size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none z-10" />
                <select
                  value={form.specialization}
                  onChange={updateField('specialization')}
                  className={cn(
                    'h-11 w-full rounded-xl pr-10 pl-4 text-sm transition-all duration-200',
                    'bg-surface-2 border text-text font-cairo appearance-none cursor-pointer',
                    errors.specialization ? 'border-error' : 'border-border',
                    'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
                    !form.specialization && 'text-text-subtle'
                  )}
                  dir="rtl"
                >
                  <option value="" disabled>اختر تخصصك</option>
                  {SPECIALIZATIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              {errors.specialization && <p className="text-xs text-error">{errors.specialization}</p>}
            </div>

            {/* WhatsApp */}
            <Input
              label="رقم الواتساب"
              placeholder="+966501234567"
              value={form.whatsapp}
              onChange={updateField('whatsapp')}
              icon={<Phone size={16} />}
              error={errors.whatsapp}
              hint="أدخل الرقم مع رمز الدولة"
              style={{ direction: 'ltr', textAlign: 'right' }}
            />

            {/* Bio */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-muted">
                نبذة عنك <span className="text-text-subtle text-xs">(اختياري)</span>
              </label>
              <textarea
                value={form.bio}
                onChange={updateField('bio')}
                placeholder="اكتب نبذة مختصرة عن خبراتك ومهاراتك..."
                rows={3}
                className={cn(
                  'w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 resize-none',
                  'bg-surface-2 border border-border',
                  'text-text placeholder:text-text-subtle font-cairo',
                  'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
                )}
                dir="rtl"
              />
            </div>

            {/* Password strength indicator */}
            {form.password && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[...Array(4)].map((_, i) => {
                    const strength = form.password.length >= 8
                      ? (form.password.length >= 10 ? 2 : 1) +
                        (/(?=.*[A-Z])(?=.*[a-z])/.test(form.password) ? 1 : 0) +
                        (/(?=.*\d)/.test(form.password) ? 1 : 0)
                      : 0;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-all duration-300',
                          i < strength
                            ? strength >= 4 ? 'bg-success' : strength >= 3 ? 'bg-warning' : 'bg-error'
                            : 'bg-border'
                        )}
                      />
                    );
                  })}
                </div>
                <p className="text-xs text-text-subtle">قوة كلمة المرور</p>
              </div>
            )}

            <Button
              type="submit"
              loading={isLoading}
              fullWidth
              size="lg"
              className="mt-2"
            >
              {isLoading ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الانضمام 🚀'}
            </Button>
          </form>
        </div>

        <p className="text-center text-text-subtle text-xs mt-6">
          بالتسجيل، أنت توافق على شروط الاستخدام وسياسة الخصوصية
        </p>
      </div>
    </div>
  );
}
