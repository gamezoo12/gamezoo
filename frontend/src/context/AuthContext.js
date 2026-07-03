import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authAPI } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Skip /me check if returning from Google OAuth callback
      if (window.location.hash && window.location.hash.includes('session_id=')) {
        setLoading(false);
        return;
      }
      const me = await authAPI.me();
      setUser(me);
    } catch (err) {
      // 401 is expected for anonymous users – log only unexpected errors
      if (err?.response?.status && err.response.status !== 401) {
        console.error('[auth] refresh failed:', err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (data) => {
    const r = await authAPI.login(data);
    localStorage.setItem('gz_token', r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (data) => {
    const r = await authAPI.register(data);
    localStorage.setItem('gz_token', r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      // Ignore network errors – we still want to clear local session
      console.warn('[auth] logout API failed (clearing local session anyway):', err?.message);
    }
    localStorage.removeItem('gz_token');
    setUser(null);
  }, []);

  const setGoogleUser = useCallback((u) => setUser(u), []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, setGoogleUser }),
    [user, loading, login, register, logout, refresh, setGoogleUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
