import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function AuthCallback() {
  const nav = useNavigate();
  const { setGoogleUser } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const hash = window.location.hash || '';
      const m = hash.match(/session_id=([^&]+)/);
      if (!m) { nav('/login'); return; }
      try {
        const r = await authAPI.googleSession(m[1]);
        if (r?.session_token) localStorage.setItem('gz_token', r.session_token);
        if (r?.user) setGoogleUser(r.user);
        window.history.replaceState(null, '', '/my-account');
        nav('/my-account', { state: { user: r?.user } });
      } catch {
        nav('/login');
      }
    })();
  }, [nav, setGoogleUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-teal-50 to-white">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto rounded-full border-4 border-teal-500 border-t-transparent animate-spin" />
        <p className="mt-4 text-slate-600">Signing you in…</p>
      </div>
    </div>
  );
}
