import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { api, onUnauthorized, setCsrfToken } from './api';
import type { Session } from './types';

type AuthValue = {
  session: Session | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    onUnauthorized(() => {
      setSession(null);
      setCsrfToken('');
    });
    api
      .request<Session | { authenticated: false }>('/api/auth/session')
      .then((value) => {
        if (!value.authenticated) return setSession(null);
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
      async login(username, password) {
        const next = await api.request<Session>('/api/auth/login', { method: 'POST', body: { username, password } });
        setSession(next);
        setCsrfToken(next.csrfToken);
      },
      async logout() {
        await api.request('/api/auth/logout', { method: 'POST' });
        setSession(null);
        setCsrfToken('');
      },
    }),
    [session, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
