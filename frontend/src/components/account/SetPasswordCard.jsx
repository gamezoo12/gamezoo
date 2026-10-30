import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { userAPI } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useToast } from '../../hooks/use-toast';

const NEXT = '/my-account/security?set_password=1';

function reauthWithGoogle() {
  sessionStorage.setItem('pl_google_next', NEXT);
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(`${window.location.origin}/auth-callback`)}`;
}

export default function SetPasswordCard({ onDone }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(!new URLSearchParams(window.location.search).get('set_password'));
  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get('new_password') !== fd.get('confirm_password')) { toast({ title: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      await userAPI.setFirstPassword(fd.get('new_password'));
      toast({ title: 'Password set', description: 'You can now sign in with Google or with your email and this password.' });
      window.history.replaceState(null, '', '/my-account/security');
      await onDone?.();
    } catch (err) {
      if (err?.response?.status === 403) setNeedsReauth(true);
      toast({ title: 'Could not set password', description: err?.response?.data?.detail || 'Please try again.' });
    } finally { setBusy(false); }
  };
  if (needsReauth) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 max-w-2xl" data-testid="set-password-reauth">
        <p>Your account uses Google sign-in and has no password yet. For your security, confirm it's you with Google first, then choose a password.</p>
        <Button type="button" onClick={reauthWithGoogle} className="mt-3 bg-slate-800 hover:bg-slate-900" data-testid="set-password-google-btn"><ShieldCheck className="mr-1 h-4 w-4" />Confirm with Google</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-4 max-w-2xl" data-testid="set-password-form">
      <p className="md:col-span-2 text-sm text-slate-600">Google confirmed. Choose a password to also sign in with your email ({'8+'} characters). You have 10 minutes.</p>
      <div><Label>New password</Label><Input data-testid="set-pw-new" name="new_password" type="password" minLength={8} required /></div>
      <div><Label>Confirm password</Label><Input data-testid="set-pw-confirm" name="confirm_password" type="password" minLength={8} required /></div>
      <div className="md:col-span-2"><Button type="submit" disabled={busy} className="bg-slate-800 hover:bg-slate-900" data-testid="set-password-btn">{busy ? 'Saving…' : 'Set password'}</Button></div>
    </form>
  );
}
