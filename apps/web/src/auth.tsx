import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { api, onUnauthorized, setCsrfToken } from './api';
import type { Session } from './types';
import type { LogoutReason } from './types';
import { clearNorthwindBrowserState } from './browser-state';
import { queryClient } from './query-client';

type AuthValue = {
  session: Session | null;
  loading: boolean;
  logoutReason: LogoutReason;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutReason, setLogoutReason] = useState<LogoutReason>(null);
  useEffect(() => {
    onUnauthorized((code) => {
      const reason = code === 'SESSION_IDLE_TIMEOUT' ? 'idle_timeout' : 'invalid_session';
      sessionStorage.setItem('northwind.logoutReason', reason);
      setLogoutReason(reason);
      setSession(null);
      setCsrfToken('');
      queryClient.clear();
    });
    api
      .request<Session | { authenticated: false; reason?: Exclude<LogoutReason, null | 'logged_out'> }>(
        '/api/auth/session',
      )
      .then((value) => {
        if (!value.authenticated) {
          const reason = value.reason ?? (sessionStorage.getItem('northwind.logoutReason') as LogoutReason);
          setLogoutReason(reason);
          return setSession(null);
        }
        setSession(value);
        setCsrfToken(value.csrfToken);
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      logoutReason,
      async login(username, password) {
        const next = await api.request<Session>('/api/auth/login', { method: 'POST', body: { username, password } });
        await clearNorthwindBrowserState();
        queryClient.clear();
        setLogoutReason(null);
        setSession(next);
        setCsrfToken(next.csrfToken);
      },
      async logout() {
        await api.request('/api/auth/logout', { method: 'POST' });
        queryClient.clear();
        setLogoutReason('logged_out');
        setSession(null);
        setCsrfToken('');
      },
    }),
    [session, loading, logoutReason],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
