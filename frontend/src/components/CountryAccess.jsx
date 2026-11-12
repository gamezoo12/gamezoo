import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Globe2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { countryAPI } from '../lib/api';
import CountrySelect from './CountrySelect';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

const STAFF = ['admin', 'super_admin', 'operator', 'support'];
const isStaff = (u) => STAFF.includes(u?.role);

// Asks existing users with no recorded country to confirm one (account access is kept meanwhile).
export function CountryPrompt() {
  const { user, refresh } = useAuth();
  const { pathname } = useLocation();
  const [country, setCountry] = useState('');
  const [later, setLater] = useState(() => sessionStorage.getItem('pl_country_later') === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const show = !!user && !isStaff(user) && !user.country_of_residence && !!user.terms_accepted_at && !later && !pathname.startsWith('/admin');
  const save = async () => {
    if (!country) return setError('Please choose a country.');
    setBusy(true); setError('');
    try { await countryAPI.setMine(country); await refresh(); }
    catch (e) { setError(e?.response?.data?.detail || 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  };
  const skip = () => { sessionStorage.setItem('pl_country_later', '1'); setLater(true); };
  return (
    <Dialog open={show} onOpenChange={(o) => !o && skip()}>
      <DialogContent className="max-w-md" data-testid="country-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-[#6C2BFF]" /> Confirm your country of residence</DialogTitle>
          <DialogDescription>We need this to show the features available where you live. Prize features stay locked until you confirm. You can keep browsing and playing free games.</DialogDescription>
        </DialogHeader>
        <CountrySelect value={country} onChange={(c) => { setCountry(c); setError(''); }} testId="country-prompt-select" />
        {error && <p className="text-xs text-red-600" data-testid="country-prompt-error">{error}</p>}
        <p className="text-[11px] text-slate-500">After confirming, changes need approval from our team.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={skip} className="flex-1" data-testid="country-prompt-later">Later</Button>
          <Button onClick={save} disabled={busy} className="flex-1 bg-[#6C2BFF] text-white" data-testid="country-prompt-save">{busy ? 'Saving…' : 'Confirm'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RULES = [
  [/^\/admin/, null],
  [/^\/(world|free-world|play|games|challenge)/, 'allow_free_games'],
  [/^\/(leaderboard|leaderboards|games-leaderboard|contest-leaderboard)/, 'allow_leaderboards'],
  [/^\/(paid-leagues|competitions|competition\/|cart|draw)/, 'allow_paid_browsing'],
];

export function blockedPermission(user, pathname) {
  const perms = user?.country_access?.permissions;
  if (!perms || isStaff(user)) return null;
  if (perms.allow_browsing === false && !pathname.startsWith('/my-account') && pathname !== '/login') return 'allow_browsing';
  for (const [re, perm] of RULES) {
    if (re.test(pathname)) return perm && perms[perm] === false ? perm : null;
  }
  return null;
}

const LABEL = { allow_browsing: 'Prize League', allow_free_games: 'Free games', allow_leaderboards: 'Leaderboards', allow_paid_browsing: 'Paid World' };

export function CountryGate({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const blocked = blockedPermission(user, pathname);
  if (!blocked) return children;
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center" data-testid="country-blocked">
      <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
      <h1 className="text-2xl font-extrabold text-slate-900">{LABEL[blocked]} isn&apos;t available in your country</h1>
      <p className="mt-3 text-sm text-slate-600">{user?.country_access?.notice || 'This part of Prize League is not available where you live.'}</p>
    </div>
  );
}

// Inline notice shown on prize pages for users whose country cannot take part in prize features.
export function PrizeRestrictionNotice({ className = '' }) {
  const { user } = useAuth();
  const access = user?.country_access;
  if (!access?.restriction_code || isStaff(user)) return null;
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 ${className}`} data-testid="prize-restriction-notice">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{access.restriction_code === 'COUNTRY_REQUIRED' ? 'Please confirm your country of residence to use prize features. ' : ''}{access.notice}</span>
    </div>
  );
}
