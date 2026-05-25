'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { cn, ROLE_LABELS } from '@/lib/utils';
import {
  Home,
  ClipboardList,
  MessageSquare,
  Users,
  Bell,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: <Home size={20} /> },
  { href: '/dashboard/requests', label: 'الطلبات', icon: <ClipboardList size={20} /> },
  { href: '/dashboard/telegram', label: 'حسابات تيليجرام', icon: <MessageSquare size={20} /> },
  { href: '/dashboard/specialists', label: 'المختصون', icon: <Users size={20} /> },
  { href: '/dashboard/notifications', label: 'الإشعارات', icon: <Bell size={20} /> },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: <Settings size={20} /> },
  { href: '/dashboard/logs', label: 'السجلات', icon: <ScrollText size={20} /> },
];

function Sidebar({
  isOpen,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();

  const { data: notifCount } = useQuery<number>({
    queryKey: ['notifications-count'],
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count').then((d) => d.count),
    refetchInterval: 30000,
  });

  const { data: pendingCount } = useQuery<number>({
    queryKey: ['pending-specialists-count'],
    queryFn: () => apiGet<{ count: number }>('/specialists/pending/count').then((d) => d.count),
    enabled: user?.role === 'admin' || user?.role === 'superadmin',
    refetchInterval: 60000,
  });

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 right-0 z-50 flex flex-col transition-all duration-300',
          'glass-nav',
          collapsed ? 'w-[72px]' : 'w-[260px]',
          // Mobile
          'md:translate-x-0',
          isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center border-b border-border transition-all duration-300',
            collapsed ? 'px-4 py-4 justify-center' : 'px-6 py-4 justify-between'
          )}
        >
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                <span className="text-lg">🚀</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-black gradient-text truncate">منصة إنجاز</h1>
                <p className="text-[10px] text-text-subtle">نظام إدارة البوت</p>
              </div>
            </Link>
          )}

          {collapsed && (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)]">
              <span className="text-lg">🚀</span>
            </div>
          )}

          <button
            onClick={onToggleCollapse}
            className="hidden md:flex p-1.5 rounded-lg text-text-subtle hover:text-text hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <ChevronLeft
              size={16}
              className={cn('transition-transform duration-300', collapsed && 'rotate-180')}
            />
          </button>

          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-text-subtle hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Connection Status */}
        <div
          className={cn(
            'mx-3 mt-3 py-2 px-3 rounded-xl flex items-center gap-2',
            isConnected ? 'bg-success/10 border border-success/20' : 'bg-error/10 border border-error/20'
          )}
        >
          {isConnected ? (
            <Wifi size={14} className="text-success flex-shrink-0" />
          ) : (
            <WifiOff size={14} className="text-error flex-shrink-0" />
          )}
          {!collapsed && (
            <span className={cn('text-xs font-medium', isConnected ? 'text-success' : 'text-error')}>
              {isConnected ? 'متصل بالخادم' : 'غير متصل'}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {!collapsed && (
            <p className="text-[10px] text-text-subtle uppercase font-bold tracking-widest px-4 mb-3">
              القائمة الرئيسية
            </p>
          )}

          {navItems.map((item) => {
            const badge =
              item.href === '/dashboard/notifications'
                ? notifCount
                : item.href === '/dashboard/specialists'
                ? pendingCount
                : undefined;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'nav-item',
                  isActive(item.href) && 'active',
                  collapsed && 'justify-center px-0'
                )}
                data-tooltip={collapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {badge && badge > 0 && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold px-1.5 shadow-[0_0_8px_rgba(99,102,241,0.5)]">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </>
                )}
                {collapsed && badge && badge > 0 && (
                  <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="border-t border-border p-3">
          {!collapsed ? (
            <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/30 to-purple-600/30 border border-accent/30 flex items-center justify-center text-sm font-bold text-accent-light flex-shrink-0">
                {user?.displayName?.[0] || user?.username?.[0] || 'م'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text truncate">
                  {user?.displayName || user?.username}
                </p>
                <p className="text-xs text-text-subtle">
                  {ROLE_LABELS[user?.role || 'specialist']}
                </p>
              </div>
              <button
                onClick={logout}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-error hover:bg-error/10 transition-all"
                title="تسجيل الخروج"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              className="w-full flex items-center justify-center p-2.5 rounded-xl text-error hover:bg-error/10 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function TopHeader({
  onMenuClick,
  collapsed,
}: {
  onMenuClick: () => void;
  collapsed: boolean;
}) {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const router = useRouter();

  const { data: notifCount } = useQuery<number>({
    queryKey: ['notifications-count'],
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count').then((d) => d.count),
    refetchInterval: 30000,
  });

  return (
    <header
      className={cn(
        'fixed top-0 left-0 z-30 h-16 flex items-center gap-4 px-6',
        'border-b border-border transition-all duration-300',
        collapsed ? 'right-[72px]' : 'right-[260px]',
        'md:right-auto',
        'bg-background/80 backdrop-blur-xl'
      )}
      style={{ right: collapsed ? 72 : 260 }}
    >
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-xl text-text-subtle hover:text-text hover:bg-white/5 transition-colors"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      {/* Quick Stats */}
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border">
        <Zap size={13} className="text-warning" />
        <span className="text-xs text-text-muted">النظام يعمل بشكل طبيعي</span>
      </div>

      {/* Notifications */}
      <button
        onClick={() => router.push('/dashboard/notifications')}
        className="relative p-2.5 rounded-xl text-text-subtle hover:text-text hover:bg-white/5 transition-colors"
      >
        <Bell size={20} />
        {notifCount && notifCount > 0 && (
          <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center font-bold shadow-[0_0_8px_rgba(99,102,241,0.6)]">
            {notifCount > 9 ? '9+' : notifCount}
          </span>
        )}
      </button>

      {/* User Avatar */}
      <div className="flex items-center gap-2.5">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-text leading-tight">
            {user?.displayName || user?.username}
          </p>
          <p className="text-xs text-text-subtle">{ROLE_LABELS[user?.role || 'specialist']}</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/30 to-purple-600/30 border border-accent/30 flex items-center justify-center text-sm font-bold text-accent-light cursor-pointer">
          {user?.displayName?.[0] || user?.username?.[0] || 'م'}
        </div>
      </div>
    </header>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/login');
    }
  }, [isLoading, isLoggedIn, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="lg" text="جارٍ التحميل..." />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      <TopHeader
        onMenuClick={() => setSidebarOpen(true)}
        collapsed={collapsed}
      />

      {/* Main Content */}
      <main
        className={cn(
          'min-h-screen pt-16 transition-all duration-300',
          collapsed ? 'md:mr-[72px]' : 'md:mr-[260px]'
        )}
      >
        <div className="p-6 animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
