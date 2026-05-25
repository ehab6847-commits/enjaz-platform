import Cookies from 'js-cookie';

const TOKEN_KEY = 'enjaz_token';
const REFRESH_KEY = 'enjaz_refresh';
const USER_KEY = 'enjaz_user';

export interface UserData {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'specialist' | 'superadmin';
  displayName: string;
  avatar?: string;
  twoFactorEnabled: boolean;
}

// ─── Token Management ────────────────────────────────────────
export function getToken(): string | null {
  return Cookies.get(TOKEN_KEY) ?? null;
}

export function setToken(token: string, rememberMe = false): void {
  const options = rememberMe
    ? { expires: 30, secure: true, sameSite: 'strict' as const }
    : { secure: true, sameSite: 'strict' as const };
  Cookies.set(TOKEN_KEY, token, options);
}

export function removeToken(): void {
  Cookies.remove(TOKEN_KEY);
}

// ─── Refresh Token ────────────────────────────────────────────
export function getRefreshToken(): string | null {
  return Cookies.get(REFRESH_KEY) ?? null;
}

export function setRefreshToken(token: string): void {
  Cookies.set(REFRESH_KEY, token, {
    expires: 30,
    secure: true,
    sameSite: 'strict',
  });
}

export function removeRefreshToken(): void {
  Cookies.remove(REFRESH_KEY);
}

// ─── User Data ────────────────────────────────────────────────
export function getStoredUser(): UserData | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserData): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeStoredUser(): void {
  localStorage.removeItem(USER_KEY);
}

// ─── Auth State ────────────────────────────────────────────────
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  } catch {
    return false;
  }
}

export function clearAuth(): void {
  removeToken();
  removeRefreshToken();
  removeStoredUser();
}

// ─── Token Decoder ────────────────────────────────────────────
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

export function getTokenExpiry(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded || typeof decoded.exp !== 'number') return null;
  return new Date(decoded.exp * 1000);
}

export function isTokenExpiringSoon(token: string, thresholdMinutes = 5): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  const now = new Date();
  const diff = (expiry.getTime() - now.getTime()) / 1000 / 60;
  return diff < thresholdMinutes;
}
