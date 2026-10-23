import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GoogleFinalizeModal from '../components/auth/GoogleFinalizeModal';

/**
 * Handles hash fragment `#session_id=...` after Emergent Google OAuth.
 * If the returned user hasn't yet verified phone / accepted T&Cs, we render a
 * mandatory finalization modal (no skip). Otherwise -> Home.
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const { setGoogleUser, refresh } = useAuth();
  const done = useRef(false);
  const [needsFinalize, setNeedsFinalize] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const hash = window.location.hash || '';
      const m = hash.match(/session_id=([^&]+)/);
      if (!m) { nav('/login', { replace: true }); return; }
      try {
        const r = await authAPI.googleSession(m[1]);
        if (r?.session_token) localStorage.setItem('gz_token', r.session_token);
        if (r?.user) setGoogleUser(r.user);
        setPendingUser(r?.user || null);
        // strip the session_id from URL bar
        window.history.replaceState(null, '', '/');
        const u = r?.user;
        const needsPhone = !u?.phone_verified;
        const needsTerms = !u?.terms_accepted_at;
        if (needsPhone || needsTerms) {
          setNeedsFinalize(true);
        } else {
          const savedNext = sessionStorage.getItem('pl_google_next');
          const destination = u?.role === 'influencer'
            ? '/influencer'
            : savedNext && savedNext.startsWith('/') && !savedNext.startsWith('//')
              ? savedNext
              : '/choose-world';

          sessionStorage.removeItem('pl_google_next');
          sessionStorage.removeItem('pl_google_promo');
          sessionStorage.removeItem('pl_google_referral_code');

          nav(destination, { replace: true });
        }
      } catch {
        nav('/login', { replace: true });
      }
    })();
  }, [nav, setGoogleUser]);

  const onFinalized = async () => {
    await refresh?.();

    const savedNext = sessionStorage.getItem('pl_google_next');
    const destination = pendingUser?.role === 'influencer'
      ? '/influencer'
      : savedNext && savedNext.startsWith('/') && !savedNext.startsWith('//')
        ? savedNext
        : '/choose-world';

    sessionStorage.removeItem('pl_google_next');
    sessionStorage.removeItem('pl_google_promo');
    sessionStorage.removeItem('pl_google_referral_code');

    nav(destination, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center pl-hero-bg">
      {!needsFinalize && (
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-full border-4 border-[#FFD54A] border-t-transparent animate-spin" />
          <p className="mt-4 text-white/80">Signing you in…</p>
        </div>
      )}
      <GoogleFinalizeModal open={needsFinalize} onComplete={onFinalized} />
    </div>
  );
}
