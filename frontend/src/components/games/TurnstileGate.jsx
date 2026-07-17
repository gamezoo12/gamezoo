import { useEffect, useRef, useState, useCallback } from 'react';
import { captchaAPI } from '../../lib/api';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

/**
 * Cloudflare Turnstile widget wrapper.
 * Renders the widget, verifies the token server-side, and calls
 * `onVerified(challenge_token)` with the short-lived challenge token the
 * frontend must attach to `/api/games/submit`.
 *
 * If Turnstile is disabled (site key missing on the server), this component
 * silently auto-verifies via the dev-mode server path — no UI shown.
 */
export default function TurnstileGate({ contestId, onVerified }) {
  const [siteKey, setSiteKey] = useState(null);
  const [enabled, setEnabled] = useState(null); // null=loading, false=disabled, true=enabled
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const widgetRef = useRef(null);
  const widgetId = useRef(null);
  const { toast } = useToast();

  const verify = useCallback(async (token) => {
    setVerifying(true);
    try {
      const r = await captchaAPI.verify(token, contestId);
      setVerified(true);
      onVerified?.(r.challenge_token);
    } catch (err) {
      toast({ title: 'CAPTCHA failed', description: err?.response?.data?.detail || 'Please try again.' });
      // Reset widget so user can retry
      if (window.turnstile && widgetId.current) {
        try { window.turnstile.reset(widgetId.current); } catch { /* noop */ }
      }
    } finally { setVerifying(false); }
  }, [contestId, onVerified, toast]);

  // Load Turnstile config from backend
  useEffect(() => {
    captchaAPI.config().then((cfg) => {
      setEnabled(!!cfg.enabled);
      setSiteKey(cfg.site_key || null);
      // Dev mode with no site key: immediately auto-verify
      if (!cfg.enabled || !cfg.site_key) {
        verify('dev-mode-no-key');
      }
    }).catch(() => {
      setEnabled(false);
      verify('dev-mode-no-key');
    });
  }, [verify]);

  // Load Turnstile script once
  useEffect(() => {
    if (!enabled || !siteKey || verified) return;
    if (window.turnstile) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [enabled, siteKey, verified]);

  // Render widget once script + key are ready
  useEffect(() => {
    if (!enabled || !siteKey || verified) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      if (window.turnstile && widgetRef.current && !widgetId.current) {
        widgetId.current = window.turnstile.render(widgetRef.current, {
          sitekey: siteKey,
          callback: (token) => verify(token),
          'error-callback': () => toast({ title: 'CAPTCHA error', description: 'Please refresh and try again.' }),
          'expired-callback': () => setVerified(false),
        });
        clearInterval(timer);
      }
    }, 200);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, siteKey, verified, verify, toast]);

  if (enabled === null) {
    return <div className="text-center text-slate-400 text-sm py-4">Checking anti-bot…</div>;
  }
  if (!enabled || verified) return null;  // dev mode or already passed

  return (
    <div className="my-4 p-4 rounded-2xl border-2 border-[#6C2BFF]/20 bg-[#6C2BFF]/5 text-center" data-testid="turnstile-gate">
      <div className="inline-flex items-center gap-2 text-slate-700 font-semibold mb-3">
        <ShieldCheck className="w-4 h-4 text-[#6C2BFF]" /> Verify you&apos;re human to start
      </div>
      <div ref={widgetRef} className="flex justify-center" data-testid="turnstile-widget" />
      {verifying && (
        <div className="inline-flex items-center gap-2 text-sm text-slate-500 mt-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
        </div>
      )}
    </div>
  );
}
