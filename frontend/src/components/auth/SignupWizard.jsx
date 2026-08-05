import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '../../hooks/use-toast';
import { authAPI, api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Phone, ShieldCheck, ArrowLeft, ArrowRight, User, Mail, Lock, Calendar, ScrollText } from 'lucide-react';
import BonusPromoBanner from '../BonusPromoBanner';

/**
 * Multi-step signup wizard:
 *  Step 1 — Name, Email, DOB, Password
 *  Step 2 — Phone (OPTIONAL) → send OTP, or SKIP to step 4
 *  Step 3 — Enter 6-digit code → verify (only reached if user chose to add phone)
 *  Step 4 — Accept T&Cs → submit registration
 *
 * Phone verification is OPTIONAL as of iter 34. Users can complete phone
 * verification later from their account security page. Redirects to `/` on success.
 */
export default function SignupWizard() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { refresh } = useAuth();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({
    name: '', email: '', dob: '', password: '',
    phone: '', normalizedPhone: '', code: '', address: '',
    accept_terms: false,
  });
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  // --- Step 1 validation & advance ---
  const submitBasics = (e) => {
    e.preventDefault();
    if (!data.name.trim() || !data.email.trim() || !data.dob || !data.password) {
      return toast({ title: 'Please fill in all fields' });
    }
    if (data.password.length < 8) return toast({ title: 'Password must be 8+ characters' });
    const today = new Date();
    const dobDate = new Date(data.dob);
    const age = today.getFullYear() - dobDate.getFullYear() - (
      (today.getMonth() < dobDate.getMonth() || (today.getMonth() === dobDate.getMonth() && today.getDate() < dobDate.getDate())) ? 1 : 0
    );
    if (Number.isNaN(age) || age < 18) return toast({ title: 'You must be 18 or older' });
    setStep(2);
  };

  // --- Step 2: send OTP ---
  const sendOtp = async () => {
    if (data.phone.length < 8) return toast({ title: 'Enter a valid mobile number' });
    setBusy(true);
    try {
      const r = await authAPI.otpSend(data.phone);
      setData((d) => ({ ...d, normalizedPhone: r.phone || data.phone }));
      setStep(3);
      setCooldown(30);
      toast({ title: 'Code sent', description: `We texted a code to ${r.phone || data.phone}` });
    } catch (err) {
      toast({ title: 'Could not send code', description: err?.response?.data?.detail || 'Check the number and try again.' });
    } finally { setBusy(false); }
  };

  // --- Step 3: verify OTP client-side (server verifies at final register) ---
  //  We move to step 4 optimistically; if code was wrong, server register call fails.
  const advanceAfterCode = (e) => {
    e.preventDefault();
    if (data.code.length !== 6) return toast({ title: 'Enter the 6-digit code' });
    setStep(4);
  };

  // --- Skip phone → jump to T&Cs
  const skipPhone = () => {
    // Wipe any partial phone entries so we don't accidentally send them.
    setData((d) => ({ ...d, phone: '', normalizedPhone: '', code: '' }));
    setStep(4);
  };

  // --- Step 4: final register. If a phone+OTP were captured, send them; otherwise register with just email/password.
  const finish = async () => {
    if (!data.accept_terms) return toast({ title: 'Please accept the Terms & Privacy Policy' });
    setBusy(true);
    try {
      const payload = {
        email: data.email,
        password: data.password,
        name: data.name,
        accept_terms: true,
        dob: data.dob,
        address: data.address || null,
      };
      // Only include phone/otp when the user actually verified them.
      if (data.normalizedPhone && data.code && data.code.length === 6) {
        payload.phone = data.normalizedPhone;
        payload.otp_code = data.code;
      }
      const r = await api.post('/auth/register', payload).then(x => x.data);
      if (r?.token) localStorage.setItem('gz_token', r.token);
      await refresh?.();
      toast({ title: `Welcome to Prize League, ${data.name.split(' ')[0]}! 🎉`, description: 'Your account is ready.' });
      nav('/', { replace: true });
    } catch (err) {
      const raw = err?.response?.data?.detail;
      const detail = Array.isArray(raw) ? raw.map(e => e.msg).join('. ') : (raw || 'Please try again.');
      if (/code/i.test(detail)) setStep(3);
      toast({ title: 'Signup failed', description: detail });
    } finally { setBusy(false); }
  };

  // -- Progress dots
  const Progress = () => (
    <div className="flex items-center gap-2 mb-6" data-testid="signup-progress">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className={`h-1.5 rounded-full flex-1 transition-colors ${n <= step ? 'bg-[#6C2BFF]' : 'bg-slate-200'}`} />
      ))}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="signup-wizard">
      <Progress />

      {step === 1 && <BonusPromoBanner className="mb-2" />}

      {step === 1 && (
        <form onSubmit={submitBasics} className="space-y-3">
          <div>
            <Label className="mb-1 block">Full name</Label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="signup-name" className="pl-9" required value={data.name} onChange={e => set('name', e.target.value)} placeholder="Alex Smith" />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Email</Label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="signup-email" className="pl-9" type="email" required value={data.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Date of birth <span className="text-slate-400 text-xs font-normal">(18+ only)</span></Label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="signup-dob" className="pl-9" type="date" required value={data.dob} onChange={e => set('dob', e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Password <span className="text-slate-400 text-xs font-normal">(8+ characters)</span></Label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="signup-password" className="pl-9" type="password" required minLength={8} value={data.password} onChange={e => set('password', e.target.value)} placeholder="At least 8 characters" />
            </div>
          </div>
          <Button data-testid="signup-step1-next" type="submit" className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold">
            Continue <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <button type="button" onClick={() => setStep(1)} className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
          <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center mb-1">
            <Phone className="w-6 h-6 text-[#6C2BFF]" />
          </div>
          <h3 className="font-display font-extrabold text-2xl text-slate-900">Add your mobile <span className="text-slate-400 text-base font-medium">(optional)</span></h3>
          <p className="text-sm text-slate-500">Add a phone now for extra account security and faster prize payouts — or skip and add it later from your account.</p>
          <div>
            <Label className="mb-1 block">Mobile number</Label>
            <Input data-testid="signup-phone" type="tel" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+44 7700 900123" autoFocus />
            <p className="text-[11px] text-slate-500 mt-1">International format e.g. +447700900123</p>
          </div>
          <div className="flex gap-2">
            <Button data-testid="signup-skip-phone" type="button" variant="outline" onClick={skipPhone} className="flex-1 h-11 font-bold">
              Skip for now
            </Button>
            <Button data-testid="signup-send-otp" onClick={sendOtp} disabled={busy || data.phone.length < 8} className="flex-1 h-11 pl-btn-purple text-white font-bold">
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1">You can verify your phone anytime from Settings → Security.</p>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={advanceAfterCode} className="space-y-3">
          <button type="button" onClick={() => setStep(2)} className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
          <div className="w-12 h-12 rounded-full bg-[#6C2BFF]/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-[#6C2BFF]" />
          </div>
          <h3 className="font-display font-extrabold text-2xl text-slate-900">Enter the code</h3>
          <p className="text-sm text-slate-500">Sent to {data.normalizedPhone}</p>
          <Input
            data-testid="signup-otp"
            inputMode="numeric"
            maxLength={6}
            required
            autoFocus
            value={data.code}
            onChange={e => set('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center text-2xl tracking-[0.5em] font-bold h-14"
            placeholder="123456"
          />
          <Button data-testid="signup-verify-code" type="submit" disabled={data.code.length !== 6} className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold">
            Continue <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <button
            type="button"
            onClick={sendOtp}
            disabled={busy || cooldown > 0}
            className="block mx-auto text-[#6C2BFF] disabled:text-slate-400 text-sm font-semibold"
            data-testid="signup-resend"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </form>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <button type="button" onClick={() => setStep(3)} className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back</button>
          <div className="w-12 h-12 rounded-full bg-[#FFD54A]/20 flex items-center justify-center">
            <ScrollText className="w-6 h-6 text-[#6C2BFF]" />
          </div>
          <h3 className="font-display font-extrabold text-2xl text-slate-900">One last thing</h3>
          <p className="text-sm text-slate-500">Confirm you agree to our terms — we can&apos;t finish signup without it.</p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 max-h-40 overflow-auto">
            By ticking the box you agree to Prize League&apos;s{' '}
            <Link to="/terms" target="_blank" className="text-[#6C2BFF] underline">Terms &amp; Conditions</Link>,{' '}
            <Link to="/privacy" target="_blank" className="text-[#6C2BFF] underline">Privacy Policy</Link>, and confirm you&apos;re 18+, a UK resident,
            and play responsibly. Prizes are subject to KYC. Free postal entry is always available.
          </div>
          <label className="flex items-start gap-3 cursor-pointer select-none py-2" data-testid="signup-terms-label">
            <Checkbox
              data-testid="signup-accept-terms"
              checked={data.accept_terms}
              onCheckedChange={(v) => set('accept_terms', !!v)}
              className="mt-0.5"
            />
            <span className="text-sm text-slate-700">I&apos;ve read and accept the Terms &amp; Privacy Policy. I&apos;m 18 or older.</span>
          </label>
          <Button
            data-testid="signup-finish"
            onClick={finish}
            disabled={busy || !data.accept_terms}
            className="w-full h-11 pl-btn-gold text-slate-900 font-extrabold"
          >
            {busy ? 'Creating your account…' : 'Create my account →'}
          </Button>
        </div>
      )}
    </div>
  );
}
