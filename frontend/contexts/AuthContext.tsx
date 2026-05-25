'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  getToken,
  setToken,
  setRefreshToken,
  clearAuth,
  getStoredUser,
  setStoredUser,
  isAuthenticated,
  UserData,
} from '@/lib/auth';
import toast from 'react-hot-toast';

interface AuthContextValue {
  user: UserData | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<{ requires2FA: boolean }>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const router = useRouter();

  // ── Initialize from stored data ─────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        if (isAuthenticated()) {
          const stored = getStoredUser();
          if (stored) {
            setUser(stored);
          } else {
            await refreshUser();
          }
        }
      } catch {
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // ── Refresh user from API ───────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get('/auth/me').then((r) => r.data as UserData);
      setUser(data);
      setStoredUser(data);
    } catch {
      clearAuth();
      setUser(null);
    }
  }, []);

  // ── Login ────────────────────────────────────────────────────
  const login = useCallback(
    async (username: string, password: string, rememberMe = false) => {
      setIsLoading(true);
      try {
        const { data } = await api.post('/auth/login', { username, password, rememberMe });

        if (data.requires2FA) {
          setPendingToken(data.tempToken ?? null);
          return { requires2FA: true };
        }

        setToken(data.token, rememberMe);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        setUser(data.user);
        setStoredUser(data.user);

        toast.success(`مرحباً ${data.user.displayName || data.user.username} 👋`);
        router.push('/dashboard');
        return { requires2FA: false };
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  // ── Verify 2FA ───────────────────────────────────────────────
  const verify2FA = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        const { data } = await api.post('/auth/2fa/verify', {
          code,
          tempToken: pendingToken,
        });
        setToken(data.token);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        setUser(data.user);
        setStoredUser(data.user);
        setPendingToken(null);
        toast.success('تم التحقق بنجاح ✓');
        router.push('/dashboard');
      } finally {
        setIsLoading(false);
      }
    },
    [pendingToken, router]
  );

  // ── Logout ───────────────────────────────────────────────────
  const logout = useCallback(() => {
    const token = getToken();
    if (token) {
      api.post('/auth/logout').catch(() => {});
    }
    clearAuth();
    setUser(null);
    toast('تم تسجيل الخروج', { icon: '👋' });
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        login,
        verify2FA,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
