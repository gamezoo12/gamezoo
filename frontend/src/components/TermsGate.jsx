import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { ShieldCheck, ExternalLink } from 'lucide-react';

/**
 * Global post-login gate: forces every signed-in user to explicitly accept the
 * Terms & Conditions + Privacy Policy before they can use the platform.
 *
 * Mounted once at the app root. Silently dormant when:
 *   • no user is signed in
 *   • the user already has `terms_accepted_at` populated
 *   • the current path is /login, /admin/login, /legal/*, /auth (avoid trapping the sign-in flow)
 */
export default function TermsGate() {
  const { user, loading, refresh } = useAuth();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);   // client-side only for this session

  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isAuthFlow = path.startsWith('/login')
    || path.startsWith('/admin/login')
    || path.startsWith('/auth')
    || path.startsWith('/legal');

  // Show only when signed in, no accepted date on record, and not on an auth page.
  const needsAcceptance =
    !loading &&
    user &&
    !isAuthFlow &&
    !dismissed &&
    !user.terms_accepted_at;

  const accept = async () => {
    if (!checked) return;
    setSubmitting(true);
    try {
      await userAPI.acceptTerms();
      setDismissed(true);
      await refresh?.();
    } catch {
      // Fail closed — keep the modal open on API error so user retries.
    } finally {
      setSubmitting(false);
    }
  };

  if (!needsAcceptance) return null;

  return (
    <Dialog open={true}>
      <DialogContent
        className="max-w-lg"
        data-testid="tc-gate"
        // no close button — user MUST accept
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 text-white flex items-center justify-center mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <DialogTitle className="font-display font-extrabold text-2xl">
            Accept our Terms &amp; Privacy
          </DialogTitle>
          <DialogDescription className="text-slate-600 leading-relaxed">
            Before you continue, please confirm you have read and agree to the
            Prize League Terms &amp; Conditions and Privacy Policy. You&apos;ll only
            need to do this once.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
          <Link
            to="/legal/terms"
            target="_blank"
            className="flex items-center justify-between text-slate-800 hover:text-indigo-700 font-medium"
            data-testid="tc-link-terms"
          >
            <span>Read Terms &amp; Conditions</span>
            <ExternalLink className="w-4 h-4 opacity-60" />
          </Link>
          <Link
            to="/legal/privacy"
            target="_blank"
            className="flex items-center justify-between text-slate-800 hover:text-indigo-700 font-medium"
            data-testid="tc-link-privacy"
          >
            <span>Read Privacy Policy</span>
            <ExternalLink className="w-4 h-4 opacity-60" />
          </Link>
        </div>

        <label className="flex items-start gap-3 mt-2 cursor-pointer select-none">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(!!v)}
            data-testid="tc-checkbox"
            className="mt-1"
          />
          <span className="text-sm text-slate-700 leading-relaxed">
            I confirm I am aged 18 or over, resident in the UK, and I accept
            the <Link to="/legal/terms" target="_blank" className="text-indigo-700 hover:underline">Terms &amp; Conditions</Link> and
            {' '}<Link to="/legal/privacy" target="_blank" className="text-indigo-700 hover:underline">Privacy Policy</Link>.
          </span>
        </label>

        <Button
          onClick={accept}
          disabled={!checked || submitting}
          className="w-full pl-btn-purple text-white mt-2"
          data-testid="tc-accept-btn"
        >
          {submitting ? 'Saving…' : 'Accept and continue'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
