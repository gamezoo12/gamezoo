import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { signupChallengeAPI } from '../../lib/api';

const SignupChallengeScreen = lazy(() => import('./SignupChallengeScreen'));
const REF_KEY = 'pl_sc_ref';
const HIDDEN = ['/admin', '/production', '/login', '/signup', '/register', '/auth', '/forgot-password', '/legal'];

function useReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    const code = new URLSearchParams(search).get('sc');
    if (!code || code.length < 4) return;
    try {
      if (localStorage.getItem(REF_KEY) === code) return;
      localStorage.setItem(REF_KEY, code);
    } catch { /* storage unavailable */ }
    signupChallengeAPI.visit(code, localStorage.getItem('pl_visitor_id') || undefined);
  }, [search]);
}

// Shows the one-time Welcome Challenge after signup + verification; the backend decides eligibility.
export default function SignupChallengeGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [data, setData] = useState(null);
  const [closed, setClosed] = useState(false);
  useReferralCapture();
  const intl = user?.country_access?.country && user.country_access.country !== 'GB';
  const tourPending = intl && (() => { try { return localStorage.getItem(`pl_intl_tour_done_${user.user_id}`) !== '1'; } catch { return false; } })();
  const ready = !!user && (!user.role || user.role === 'user') && !!user.terms_accepted_at && !!user.country_of_residence && !tourPending;
  const readyKey = ready ? `${user.user_id}:${user.phone_verified ? 1 : 0}` : '';

  useEffect(() => {
    if (!readyKey) return undefined;
    let live = true;
    (async () => {
      let ref = null;
      try { ref = localStorage.getItem(REF_KEY); } catch { /* storage unavailable */ }
      if (ref) { await signupChallengeAPI.referralSignup(ref); try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ } }
      try { const r = await signupChallengeAPI.me(); if (live && r.show) setData(r); } catch { /* challenge unavailable */ }
    })();
    return () => { live = false; };
  }, [readyKey]);

  const hidden = HIDDEN.some((p) => pathname.startsWith(p));
  if (!data || closed || hidden) return null;
  return (
    <Suspense fallback={null}>
      <SignupChallengeScreen initial={data} onClose={() => { setClosed(true); setData(null); }} />
    </Suspense>
  );
}
