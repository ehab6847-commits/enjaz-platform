'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { User, Lock, Rocket, Eye, ChevronLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  color: string;
}

function ParticlesBackground() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const colors = [
      'rgba(99,102,241,0.6)',
      'rgba(139,92,246,0.5)',
      'rgba(59,130,246,0.4)',
      'rgba(16,185,129,0.3)',
    ];
    const gen = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      speed: Math.random() * 20 + 15,
      opacity: Math.random() * 0.5 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles(gen);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            opacity: p.opacity,
            animation: `particleFloat ${p.speed}s linear infinite`,
            animationDelay: `${-Math.random() * p.speed}s`,
          }}
        />
      ))}
      {/* Glow orbs */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse-slow"
        style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/3 rounded-full blur-3xl" />
    </div>
  );
}

export default function LoginPage() {
  const { login, verify2FA, isLoading } = useAuth();
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const twoFARef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step === '2fa') twoFARef.current?.focus();
  }, [step]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = 'اسم المستخدم مطلوب';
    if (!password) e.password = 'كلمة المرور مطلوبة';
    else if (password.length < 6) e.password = 'كلمة المرور قصيرة جداً';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const { requires2FA } = await login(username, password, rememberMe);
      if (requires2FA) {
        setStep('2fa');
        toast('أدخل رمز التحقق المرسل إلى تطبيقك', { icon: '🔐' });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg?.includes('password') || msg?.includes('كلمة')) {
        setErrors({ password: 'كلمة المرور غير صحيحة' });
      } else if (msg?.includes('user') || msg?.includes('مستخدم')) {
        setErrors({ username: 'اسم المستخدم غير موجود' });
      } else {
        setErrors({ general: msg || 'خطأ في تسجيل الدخول' });
      }
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFACode || twoFACode.length !== 6) {
      setErrors({ twoFA: 'الرمز يجب أن يكون 6 أرقام' });
      return;
    }
    try {
      await verify2FA(twoFACode);
    } catch {
      setErrors({ twoFA: 'رمز التحقق غير صحيح' });
      setTwoFACode('');
    }
  };

  return (
    <div className="login-bg min-h-screen flex items-center justify-center relative overflow-hidden">
      <ParticlesBackground />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Login Card */}
      <div
        className={cn(
          'relative z-10 w-full max-w-md mx-4 transition-all duration-700',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        )}
      >
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-accent to-purple-600 opacity-20 blur-md" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/20 to-purple-600/20 border border-accent/30 flex items-center justify-center backdrop-blur-sm">
              <span className="text-4xl animate-bounce-gentle">🚀</span>
            </div>
          </div>
          <h1 className="text-3xl font-black gradient-text mb-1">منصة إنجاز</h1>
          <p className="text-text-muted text-sm">نظام إدارة البوت الذكي للمختصين</p>
        </div>

        {/* Card */}
        <div
          className="rounded-3xl p-8 relative overflow-hidden"
          style={{
            background: 'rgba(30, 41, 59, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.07)',
          }}
        >
          {/* Top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />

          {step === 'credentials' ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text">تسجيل الدخول</h2>
                <p className="text-text-subtle text-sm mt-1">أدخل بيانات حسابك للمتابعة</p>
              </div>

              {errors.general && (
                <div className="mb-4 p-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm flex items-center gap-2">
                  <span>⚠️</span>
                  {errors.general}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5" noValidate>
                <Input
                  label="اسم المستخدم"
                  placeholder="أدخل اسم المستخدم"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errors.username) setErrors((prev) => ({ ...prev, username: '' }));
                  }}
                  icon={<User size={16} />}
                  error={errors.username}
                  autoComplete="username"
                  autoFocus
                />

                <Input
                  type="password"
                  label="كلمة المرور"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  icon={<Lock size={16} />}
                  error={errors.password}
                  autoComplete="current-password"
                />

                {/* Remember me */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200',
                          rememberMe
                            ? 'bg-accent border-accent'
                            : 'bg-transparent border-border group-hover:border-accent/50'
                        )}
                      >
                        {rememberMe && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-text-muted group-hover:text-text transition-colors">
                      تذكرني
                    </span>
                  </label>
                  <Link
                    href="#"
                    className="text-sm text-accent-light hover:text-accent transition-colors"
                  >
                    نسيت كلمة المرور؟
                  </Link>
                </div>

                <Button
                  type="submit"
                  loading={isLoading}
                  fullWidth
                  size="lg"
                  className="mt-2"
                >
                  {isLoading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-border text-center">
                <p className="text-text-subtle text-sm">
                  مختص جديد؟{' '}
                  <Link
                    href="/register"
                    className="text-accent-light hover:text-accent font-medium transition-colors"
                  >
                    طلب الانضمام
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('credentials')}
                className="flex items-center gap-2 text-text-muted hover:text-text text-sm mb-6 transition-colors group"
              >
                <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                العودة
              </button>

              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-4">
                  <Shield className="text-accent-light" size={28} />
                </div>
                <h2 className="text-xl font-bold text-text">التحقق بخطوتين</h2>
                <p className="text-text-subtle text-sm mt-2">
                  أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة
                </p>
              </div>

              <form onSubmit={handle2FA} className="space-y-5">
                <div className="flex justify-center gap-2 dir-ltr">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={1}
                      value={twoFACode[i] || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        const newCode = twoFACode.split('');
                        newCode[i] = val;
                        const joined = newCode.join('').slice(0, 6);
                        setTwoFACode(joined);
                        setErrors({});
                        if (val && i < 5) {
                          const next = document.querySelector<HTMLInputElement>(
                            `[data-otp-idx="${i + 1}"]`
                          );
                          next?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !twoFACode[i] && i > 0) {
                          const prev = document.querySelector<HTMLInputElement>(
                            `[data-otp-idx="${i - 1}"]`
                          );
                          prev?.focus();
                        }
                      }}
                      data-otp-idx={i}
                      className={cn(
                        'w-11 h-14 text-center text-xl font-bold rounded-xl transition-all duration-200',
                        'bg-surface-2 border-2 text-text',
                        twoFACode[i]
                          ? 'border-accent bg-accent/10'
                          : 'border-border focus:border-accent focus:bg-surface',
                        'focus:outline-none focus:ring-2 focus:ring-accent/20',
                        errors.twoFA && 'border-error'
                      )}
                      style={{ direction: 'ltr' }}
                    />
                  ))}
                </div>

                {errors.twoFA && (
                  <p className="text-center text-error text-sm">{errors.twoFA}</p>
                )}

                <Button
                  type="submit"
                  loading={isLoading}
                  fullWidth
                  size="lg"
                  disabled={twoFACode.length !== 6}
                >
                  {isLoading ? 'جارٍ التحقق...' : 'تحقق'}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-text-subtle text-xs mt-6">
          منصة إنجاز © {new Date().getFullYear()} — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
