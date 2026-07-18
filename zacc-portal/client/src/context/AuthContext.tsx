import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setTokens, getAccessToken } from '../api/client';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginStepResult>;
  verifyMfaSetup: (tempToken: string, token: string) => Promise<void>;
  verifyMfaChallenge: (tempToken: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

type LoginStepResult =
  | { kind: 'setup'; tempToken: string; qrCodeDataUrl: string; manualEntryKey: string }
  | { kind: 'challenge'; tempToken: string };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch {
      setTokens(null, null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginStepResult> => {
    const res = await api.post('/auth/login', { email, password }, { skipAuth: true });
    if (res.mfaSetupRequired) {
      return { kind: 'setup', tempToken: res.tempToken, qrCodeDataUrl: res.qrCodeDataUrl, manualEntryKey: res.manualEntryKey };
    }
    return { kind: 'challenge', tempToken: res.tempToken };
  }, []);

  const completeSession = useCallback((data: any) => {
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const verifyMfaSetup = useCallback(
    async (tempToken: string, token: string) => {
      const res = await api.post('/auth/mfa/setup/verify', { tempToken, token }, { skipAuth: true });
      completeSession(res);
    },
    [completeSession]
  );

  const verifyMfaChallenge = useCallback(
    async (tempToken: string, token: string) => {
      const res = await api.post('/auth/mfa/challenge', { tempToken, token }, { skipAuth: true });
      completeSession(res);
    },
    [completeSession]
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('zacc_refresh_token');
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      /* ignore */
    }
    setTokens(null, null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfaSetup, verifyMfaChallenge, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
