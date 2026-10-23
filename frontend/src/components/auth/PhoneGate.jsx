import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PhoneOtpModal from './PhoneOtpModal';
import GoogleFinalizeModal from './GoogleFinalizeModal';
import { useAuth } from '../../context/AuthContext';

// Sign-in pages and the OAuth callback (which shows its own wizard) are exempt.
const EXEMPT_PREFIXES = ['/login', '/admin/login', '/auth', '/legal', '/terms', '/privacy'];

// Blocks the whole app until the server says the mobile number is verified; cannot be dismissed.
export default function PhoneGate() {
  const { user, loading, refresh, logout } = useAuth();
  const { pathname } = useLocation();
  const [blockedByApi, setBlockedByApi] = useState(false);

  useEffect(() => {
    const onRequired = () => setBlockedByApi(true);
    window.addEventListener('pl:phone-required', onRequired);
    return () => window.removeEventListener('pl:phone-required', onRequired);
  }, []);

  const exempt = EXEMPT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const required = !loading && !!user && !exempt && (user.phone_verification_required === true || blockedByApi);
  if (!required) return null;

  const signOut = async () => {
    await logout?.();
    window.location.href = '/login';
  };
  const onVerified = async () => { setBlockedByApi(false); await refresh?.(); };

  // Google accounts missing DOB or terms need the full wizard so one pass completes the account.
  if (user.method === 'google' && (!user.dob || !user.terms_accepted_at)) {
    return <GoogleFinalizeModal open onComplete={onVerified} onSignOut={signOut} />;
  }
  return <PhoneOtpModal open onVerified={onVerified} onSignOut={signOut} />;
}
