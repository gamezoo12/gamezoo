import React, { createContext, useContext, useEffect, useState } from 'react';
import { authAPI } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      // Skip /me check if returning from Google OAuth callback
      if (window.location.hash && window.location.hash.includes('session_id=')) {
        setLoading(false);
        return;
      }
      const me = await authAPI.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (data) => {
    const r = await authAPI.login(data);
    localStorage.setItem('gz_token', r.token);
    setUser(r.user);
    return r.user;
  };

  const register = async (data) => {
    const r = await authAPI.register(data);
    localStorage.setItem('gz_token', r.token);
    setUser(r.user);
    return r.user;
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch { /* noop */ }
    localStorage.removeItem('gz_token');
    setUser(null);
  };

  const setGoogleUser = (u) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setGoogleUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
