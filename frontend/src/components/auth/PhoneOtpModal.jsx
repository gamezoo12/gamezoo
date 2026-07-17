import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Phone, ShieldCheck, ArrowLeft } from 'lucide-react';
import { authAPI } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';

/**
 * Blocking OTP verification modal shown post-signup / post Google-auth
 * until the user has a verified phone number on file.
 *
 * Props:
 *   open        boolean
 *   onVerified  fn()  called after successful verify+bind (parent should refresh user)
 *   onDismiss   fn()  optional. If provided the modal shows a "Skip for now" link.
 */
export default function PhoneOtpModal({ open, onVerified, onDismiss }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setStep('phone'); setPhone(''); setCode(''); setNormalizedPhone(''); setCooldown(0);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async () => {
    setBusy(true);
    try {
      const r = await authAPI.otpSend(phone);
      setNormalizedPhone(r.phone || phone);
      setStep('code');
      setCooldown(30);
      toast({ title: 'Code sent', description: `We texted a 6-digit code to ${r.phone || phone}` });
    } catch (err) {
      toast({ title: 'Could not send code', description: err?.response?.data?.detail || 'Please check the number and try again.' });
    } finally { setBusy(false); }
  };

  const verifyCode = async () => {
    setBusy(true);
    try {
      await authAPI.otpVerifyBind(normalizedPhone, code);
      toast({ title: 'Phone verified ✓', description: 'Your account is now secured.' });
      onVerified?.();
    } catch (err) {
      toast({ title: 'Verification failed', description: err?.response?.data?.detail || 'Invalid or expired code' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && onDismiss) onDismiss(); }}>
      <DialogContent className="max-w-md" data-testid="otp-modal">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-[#6C2BFF]" />
          </div>
          <DialogTitle className="text-2xl font-extrabold text-slate-900">
            {step === 'phone' ? 'Verify your phone' : 'Enter the 6-digit code'}
          </DialogTitle>
          <DialogDescription>
            {step === 'phone'
              ? 'Add a mobile number to secure your account and receive winner notifications.'
              : `We sent a code to ${normalizedPhone}. It expires in 10 minutes.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'phone' ? (
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Mobile number</Label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  data-testid="otp-phone-input"
                  className="pl-9"
                  type="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+44 7700 900123"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Use international format e.g. +447700900123</p>
            </div>
            <Button
              data-testid="otp-send-btn"
              onClick={sendCode}
              disabled={busy || phone.length < 8}
              className="w-full h-11 pl-btn-purple text-white font-bold"
            >
              {busy ? 'Sending…' : 'Send verification code'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">6-digit code</Label>
              <Input
                data-testid="otp-code-input"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.5em] font-bold h-14"
              />
            </div>
            <Button
              data-testid="otp-verify-btn"
              onClick={verifyCode}
              disabled={busy || code.length !== 6}
              className="w-full h-11 pl-btn-gold font-extrabold text-slate-900"
            >
              {busy ? 'Verifying…' : 'Verify & continue →'}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="w-3 h-3" /> Change number
              </button>
              <button
                type="button"
                data-testid="otp-resend-btn"
                onClick={sendCode}
                disabled={busy || cooldown > 0}
                className="text-[#6C2BFF] disabled:text-slate-400 font-semibold"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}

        {onDismiss && (
          <button
            data-testid="otp-skip-btn"
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 text-center w-full mt-2"
          >
            Skip for now — I&apos;ll add it later
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
