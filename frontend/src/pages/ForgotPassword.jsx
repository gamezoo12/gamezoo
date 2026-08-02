import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
} from 'lucide-react';

import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import { authAPI } from '../lib/api';
import PrizeLeagueLogo from '../components/layout/PrizeLeagueLogo';

export default function ForgotPassword() {
  const nav = useNavigate();
  const { toast } = useToast();

  // phone | code | password | success
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendCode = async (event) => {
    event?.preventDefault();

    if (phone.trim().length < 8) {
      toast({ title: 'Enter a valid mobile number' });
      return;
    }

    setBusy(true);

    try {
      const response = await authAPI.passwordResetSend(phone.trim());

      setNormalizedPhone(response?.phone || phone.trim());
      setStep('code');
      setCooldown(30);

      toast({
        title: 'Check your phone',
        description:
          response?.message ||
          'If the account exists, a password reset code has been sent.',
      });
    } catch (error) {
      toast({
        title: 'Could not send code',
        description:
          error?.response?.data?.detail ||
          'Please check the number and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const continueFromCode = (event) => {
    event.preventDefault();

    if (code.length !== 6) {
      toast({ title: 'Enter the 6-digit verification code' });
      return;
    }

    setStep('password');
  };

  const resetPassword = async (event) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      toast({ title: 'Password must be at least 8 characters' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match' });
      return;
    }

    setBusy(true);

    try {
      await authAPI.passwordResetConfirm(
        normalizedPhone || phone,
        code,
        newPassword
      );

      setStep('success');

      toast({
        title: 'Password updated',
        description: 'You can now sign in with your new password.',
      });
    } catch (error) {
      const detail =
        error?.response?.data?.detail ||
        'The code may be invalid or expired.';

      if (/code|expired/i.test(detail)) {
        setStep('code');
      }

      toast({
        title: 'Password reset failed',
        description: detail,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex mb-6"
          aria-label="Prize League home"
        >
          <PrizeLeagueLogo size={42} />
        </Link>

        <div className="rounded-3xl border border-slate-100 bg-white shadow-xl p-6 md:p-8">
          {step !== 'success' && (
            <div className="flex items-center gap-2 mb-6">
              {['phone', 'code', 'password'].map((name, index) => {
                const order = ['phone', 'code', 'password'];
                const currentIndex = order.indexOf(step);

                return (
                  <div
                    key={name}
                    className={`h-1.5 flex-1 rounded-full ${
                      index <= currentIndex
                        ? 'bg-[#6C2BFF]'
                        : 'bg-slate-200'
                    }`}
                  />
                );
              })}
            </div>
          )}

          {step === 'phone' && (
            <form onSubmit={sendCode} className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#6C2BFF]/10 flex items-center justify-center">
                <Phone className="w-6 h-6 text-[#6C2BFF]" />
              </div>

              <div>
                <h1 className="font-display text-3xl font-extrabold text-slate-900">
                  Forgot password?
                </h1>
                <p className="text-sm text-slate-500 mt-2">
                  Enter the verified mobile number linked to your Prize League
                  account.
                </p>
              </div>

              <div>
                <Label className="mb-1 block">Registered mobile number</Label>
                <Input
                  type="tel"
                  required
                  autoFocus
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+44 7700 900123"
                  data-testid="forgot-password-phone"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Use international format, for example +447700900123.
                </p>
              </div>

              <Button
                type="submit"
                disabled={busy || phone.trim().length < 8}
                className="w-full h-11 pl-btn-purple text-white font-bold"
                data-testid="forgot-password-send"
              >
                {busy ? 'Sending…' : 'Send reset code'}
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </Link>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={continueFromCode} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                }}
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Change number
              </button>

              <div className="w-12 h-12 rounded-2xl bg-[#6C2BFF]/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-[#6C2BFF]" />
              </div>

              <div>
                <h1 className="font-display text-3xl font-extrabold text-slate-900">
                  Enter the code
                </h1>
                <p className="text-sm text-slate-500 mt-2">
                  Enter the 6-digit code sent to {normalizedPhone || phone}.
                </p>
              </div>

              <Input
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value.replace(/\D/g, '').slice(0, 6)
                  )
                }
                className="text-center text-2xl tracking-[0.5em] font-bold h-14"
                placeholder="123456"
                data-testid="forgot-password-code"
              />

              <Button
                type="submit"
                disabled={code.length !== 6}
                className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
                data-testid="forgot-password-code-next"
              >
                Continue
              </Button>

              <button
                type="button"
                onClick={sendCode}
                disabled={busy || cooldown > 0}
                className="block mx-auto text-sm font-semibold text-[#6C2BFF] disabled:text-slate-400"
                data-testid="forgot-password-resend"
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : 'Resend code'}
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={resetPassword} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep('code')}
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="w-12 h-12 rounded-2xl bg-[#FFD54A]/20 flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-[#6C2BFF]" />
              </div>

              <div>
                <h1 className="font-display text-3xl font-extrabold text-slate-900">
                  Create a new password
                </h1>
                <p className="text-sm text-slate-500 mt-2">
                  Use at least 8 characters and do not reuse an old password.
                </p>
              </div>

              <div>
                <Label className="mb-1 block">New password</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(event.target.value)
                    }
                    className="pl-9"
                    data-testid="forgot-password-new"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1 block">Confirm new password</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    className="pl-9"
                    data-testid="forgot-password-confirm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={
                  busy ||
                  newPassword.length < 8 ||
                  confirmPassword.length < 8
                }
                className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
                data-testid="forgot-password-submit"
              >
                {busy ? 'Updating…' : 'Reset password'}
              </Button>
            </form>
          )}

          {step === 'success' && (
            <div className="text-center space-y-5">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />

              <div>
                <h1 className="font-display text-3xl font-extrabold text-slate-900">
                  Password updated
                </h1>
                <p className="text-sm text-slate-500 mt-2">
                  Your previous sessions have been signed out. Use your new
                  password to log in.
                </p>
              </div>

              <Button
                type="button"
                onClick={() => nav('/login', { replace: true })}
                className="w-full h-11 pl-btn-purple text-white font-bold"
                data-testid="forgot-password-login"
              >
                Go to login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
